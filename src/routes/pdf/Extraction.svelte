<script>
	import { onMount } from 'svelte';
	import NewSchemaModal from './NewSchemaModal.svelte';
	
	let file = null;
	let extractionInProgress = false;
	let streamBuffer = '';
	let tableRows = [];
	let testsData = null;
	let showValidation = false;
	
	// Schemas state (could also be stored in a Svelte store)
	let schemas = [];
	let selectedSchemaIndex = -1;
	let editingSchemaIndex = -1;
	let newSchemaModal = false;
	let newSchema = {
		schemaName: '',
		tableName: '',
		columns: [{ name: '', type: 'VARCHAR' }],
		comments: '',
		validations: ''
	};
	
	const xref = {
		"example_*.csv": "{yyyy}/{mm}/{dd}/example_*.csv"
	};
	
	onMount(() => {
		const stored = localStorage.getItem('schemas');
		if (stored) {
			schemas = JSON.parse(stored);
		}
	});
	
	function saveSchemas() {
		localStorage.setItem('schemas', JSON.stringify(schemas));
	}
	
	function handleFileChange(event) {
		file = event.target.files[0];
	}
	
	async function extractFile() {
		if (!file) return;
		extractionInProgress = true;
		streamBuffer = '';
		tableRows = [];
		testsData = null;
		showValidation = false;
	
		const fileName = file.name.toLowerCase();
		if (fileName.endsWith('.csv')) {
			await extractCSV();
		} else if (fileName.endsWith('.pdf')) {
			await extractPDF();
		} else {
			console.error('Unsupported file type');
			extractionInProgress = false;
		}
	}
	
	async function extractCSV() {
		try {
			const reader = new FileReader();
			reader.onload = function (e) {
				const text = e.target.result;
				const lines = text.split('\n').filter(line => line.trim() !== '');
				if (lines.length === 0) return;
				const headers = lines[0].split(',').map(header => header.trim());
				tableRows = lines.slice(1).map(line => {
					const values = line.split(',').map(value => value.trim());
					let rowObj = {};
					headers.forEach((header, index) => {
						rowObj[header] = values[index] || '';
					});
					return rowObj;
				});
				extractionInProgress = false;
			};
			reader.onerror = function (err) {
				console.error('Error reading CSV:', err);
				extractionInProgress = false;
			};
			reader.readAsText(file);
		} catch (error) {
			console.error('Extraction error:', error);
			extractionInProgress = false;
		}
	}
	
	async function extractPDF() {
		try {
			const formData = new FormData();
			formData.append('file', file);
			const res = await fetch('/api/upload', {
				method: 'POST',
				body: formData
			});
			const uploadedFile = await res.json();
			if (uploadedFile.error) {
				throw new Error(uploadedFile.error);
			}
	
			let promptBase = 'Please extract the holdings table from the attached PDF.\nExtract the following table:';
	
			if (selectedSchemaIndex >= 0 && schemas[selectedSchemaIndex]) {
				const schema = schemas[selectedSchemaIndex];
				const columnsText = schema.columns
					.filter((col) => col.name.trim())
					.map((col) => `${col.name}(${col.type})`)
					.join(', ');
				promptBase += `${schema.tableName} with columns: ${columnsText}.\n`;
				if (schema.comments) {
					promptBase += `Comments: ${schema.comments}\n`;
				}
				if (schema.validations) {
					promptBase += `Validation Exceptions: ${schema.validations}\n`;
				}
			}
	
			promptBase += `Return the result as a JSON object with no additional commentary. Add a column called exceptions and provide any data exceptions you find in the row.`;
	
			const history = [
				{
					role: 'user',
					parts: [
						{
							fileData: {
								mimeType: uploadedFile.mimeType,
								fileUri: uploadedFile.uri
							}
						},
						{ text: promptBase }
					]
				}
			];
	
			const generationConfig = {
				temperature: 1,
				topP: 0.95,
				topK: 40,
				maxOutputTokens: 100000,
				responseMimeType: 'text/plain'
			};
	
			const { PUBLIC_GEMINI_KEY } = await import('$env/static/public');
			const { GoogleGenerativeAI } = await import('@google/generative-ai');
			const genAI = new GoogleGenerativeAI(PUBLIC_GEMINI_KEY);
			const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
			const chat = model.startChat({ history, generationConfig });
			const streamResult = await chat.sendMessageStream('');
	
			for await (const chunk of streamResult.stream) {
				const textChunk = chunk.text();
				streamBuffer += textChunk;
				const regex = /{[^{}]*}/g;
				let match;
				while ((match = regex.exec(streamBuffer)) !== null) {
					try {
						const obj = JSON.parse(match[0]);
						if ('tests' in obj) {
							testsData = obj.tests;
						} else {
							if (!tableRows.some((row) => JSON.stringify(row) === JSON.stringify(obj))) {
								tableRows = [...tableRows, obj];
							}
						}
					} catch (e) {
						// Incomplete JSON? Continue waiting.
					}
				}
			}
		} catch (error) {
			console.error('Extraction error:', error);
		} finally {
			extractionInProgress = false;
		}
	}
	
	function editSchema() {
		if (selectedSchemaIndex >= 0) {
			editingSchemaIndex = selectedSchemaIndex;
			newSchema = { ...schemas[selectedSchemaIndex] };
			newSchemaModal = true;
		}
	}
	
	function generateCSV() {
		if (!tableRows.length) return '';
		const headers = Object.keys(tableRows[0]);
		const csvRows = [
			headers.join(','), // header row
			...tableRows.map(row => headers.map(header => row[header]).join(','))
		];
		return csvRows.join('\n');
	}
	
	function pad(num) {
		return num.toString().padStart(2, '0');
	}
	
	function getDestinationPath(fileName) {
		for (const pattern in xref) {
			const [prefix, suffix] = pattern.split('*');
			if (fileName.startsWith(prefix) && fileName.endsWith(suffix)) {
				let template = xref[pattern];
				const today = new Date();
				const yyyy = today.getFullYear();
				const mm = pad(today.getMonth() + 1);
				const dd = pad(today.getDate());
				template = template.replace('{yyyy}', yyyy).replace('{mm}', mm).replace('{dd}', dd);
				const dynamicPart = fileName.substring(prefix.length, fileName.length - suffix.length);
				template = template.replace('*', dynamicPart);
				return template;
			}
		}
		return fileName;
	}
	
	async function uploadCSV() {
		const csvContent = generateCSV();
		if (!csvContent) {
			console.error('No data to upload.');
			return;
		}
		const today = new Date();
		const yyyy = today.getFullYear();
		const mm = pad(today.getMonth() + 1);
		const dd = pad(today.getDate());
		const fileName = `example_${yyyy}_${mm}_${dd}.csv`;
		const destinationPath = getDestinationPath(fileName);
		console.log('Uploading to:', destinationPath);
	
		try {
			const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
			const formData = new FormData();
			formData.append('file', blob, fileName);
			formData.append('destinationPath', destinationPath);
			const response = await fetch('/api/r2upload', {
				method: 'POST',
				body: formData
			});
			const result = await response.json();
			if (result.error) {
				throw new Error(result.error);
			}
			console.log('Upload successful:', result);
		} catch (error) {
			console.error('Upload error:', error);
		}
	}
</script>

<div class="space-y-4">
	<div class="flex items-center justify-between">
		{#if !extractionInProgress && testsData}
			<button class="btn btn-info" on:click={() => (showValidation = !showValidation)}>
				{showValidation ? 'Hide Validation' : 'Show Validation'}
			</button>
		{/if}
	</div>
	<div class="flex flex-wrap items-end gap-4">
		<div class="form-control">
			<label class="label">
				<span class="label-text">Upload PDF or CSV</span>
			</label>
			<input
				type="file"
				accept=".pdf, application/pdf, .csv, text/csv"
				class="file-input file-input-bordered"
				on:change={handleFileChange}
			/>
		</div>
		<div class="form-control">
			<label class="label">
				<span class="label-text">Select Schema (for PDFs)</span>
			</label>
			<select bind:value={selectedSchemaIndex} class="select select-bordered">
				<option value="-1">-- None --</option>
				{#each schemas as schema, index}
					<option value={index}>{schema.schemaName}</option>
				{/each}
			</select>
		</div>
		{#if selectedSchemaIndex >= 0}
			<div class="form-control">
				<button class="btn btn-warning" on:click={editSchema}>Edit Schema</button>
			</div>
		{/if}
		<div class="form-control">
			<button class="btn btn-primary" on:click={() => (newSchemaModal = true)}>New Schema</button>
		</div>
		<div class="form-control">
			<button class="btn btn-secondary" on:click={extractFile} disabled={extractionInProgress || !file}>
				{extractionInProgress ? 'Extracting...' : 'Extract File'}
			</button>
		</div>
		<div class="form-control">
			<button class="btn btn-success" on:click={uploadCSV} disabled={!tableRows.length}>
				Upload Data to R2
			</button>
		</div>
	</div>
	
	{#if newSchemaModal}
		<NewSchemaModal {newSchema} {editingSchemaIndex} on:save={(e) => {
			if (editingSchemaIndex !== -1) {
				schemas[editingSchemaIndex] = e.detail.schema;
				editingSchemaIndex = -1;
			} else {
				schemas.push(e.detail.schema);
			}
			saveSchemas();
			newSchemaModal = false;
		}} on:cancel={() => { newSchemaModal = false; editingSchemaIndex = -1; }} />
	{/if}
	
	{#if tableRows.length > 0}
		<div class="overflow-x-auto">
			<h3 class="mb-2 text-xl font-bold">Extracted Data</h3>
			<table class="table w-full">
				<thead>
					<tr>
						{#each Object.keys(tableRows[0]) as header}
							<th>{header}</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each tableRows as row}
						<tr>
							{#each Object.keys(row) as key}
								<td>{row[key]}</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
	
	{#if showValidation && testsData}
		<div class="card bg-base-200 p-4">
			<h3 class="card-title">Validation Results</h3>
			<pre class="whitespace-pre-wrap">{JSON.stringify(testsData, null, 2)}</pre>
		</div>
	{/if}
</div>
