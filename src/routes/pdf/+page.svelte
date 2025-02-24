<script>
	import { onMount } from 'svelte';
	import { GoogleGenerativeAI } from '@google/generative-ai';
	import { PUBLIC_GEMINI_KEY } from '$env/static/public';

	// File and extraction state
	let file = null;
	let extractionInProgress = false;
	let streamBuffer = '';
	let tableRows = [];
	let testsData = null;
	let showValidation = false; // controls visibility of tests section

	// Schemas (persisted in localStorage) for PDF extraction
	let schemas = [];
	let selectedSchemaIndex = -1;

	// For editing an existing schema (-1 means no editing in progress)
	let editingSchemaIndex = -1;

	// New / edit schema form state
	let newSchemaModal = false;
	let newSchema = {
		schemaName: '',
		tableName: '',
		columns: [{ name: '', type: 'VARCHAR' }],
		comments: '',
		validations: ''
	};

	// Hard-coded xref mapping.
	// Key is a pattern and value is a template for the destination path.
	// For example: for files like "example_*.csv" the destination will be "{yyyy}/{mm}/{dd}/example_*.csv"
	const xref = {
		"example_*.csv": "{yyyy}/{mm}/{dd}/example_*.csv"
	};

	// Load schemas from localStorage on mount
	onMount(() => {
		const stored = localStorage.getItem('schemas');
		if (stored) {
			schemas = JSON.parse(stored);
		}
	});

	function saveSchemas() {
		localStorage.setItem('schemas', JSON.stringify(schemas));
	}

	// Add new column to newSchema form
	function addColumn() {
		newSchema.columns.push({ name: '', type: 'VARCHAR' });
		newSchema = newSchema;
	}

	// Save new schema or update existing schema
	function saveNewSchema() {
		if (editingSchemaIndex !== -1) {
			// Update the schema at the editing index.
			schemas[editingSchemaIndex] = { ...newSchema };
			editingSchemaIndex = -1;
		} else {
			// Add new schema.
			schemas.push({ ...newSchema });
			schemas = schemas;
		}
		saveSchemas();
		newSchemaModal = false;
		// Reset form state.
		newSchema = {
			schemaName: '',
			tableName: '',
			columns: [{ name: '', type: 'VARCHAR' }],
			comments: '',
			validations: ''
		};
	}

	// When the file input changes.
	function handleFileChange(event) {
		file = event.target.files[0];
	}

	// Unified extraction function that routes based on file type.
	async function extractFile() {
		if (!file) return;
		// Reset state.
		extractionInProgress = true;
		streamBuffer = '';
		tableRows = [];
		testsData = null;
		showValidation = false;

		// Determine file type by extension.
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

	// Function to extract CSV data.
	async function extractCSV() {
		try {
			const reader = new FileReader();
			reader.onload = function (e) {
				const text = e.target.result;
				// Split the CSV into non-empty lines.
				const lines = text.split('\n').filter(line => line.trim() !== '');
				if (lines.length === 0) return;
				
				// Assume the first line is the header.
				const headers = lines[0].split(',').map(header => header.trim());
				// Process each row into an object.
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

	// Function to extract PDF data using Gemini (PDF extraction remains the same).
	async function extractPDF() {
		try {
			// Create FormData and append the file.
			const formData = new FormData();
			formData.append('file', file);

			// Call the API endpoint that uploads the file.
			const res = await fetch('/api/upload', {
				method: 'POST',
				body: formData
			});
			const uploadedFile = await res.json();
			if (uploadedFile.error) {
				throw new Error(uploadedFile.error);
			}

			// Build the Gemini message history using the selected schema (if any)
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

			// Generation configuration
			const generationConfig = {
				temperature: 1,
				topP: 0.95,
				topK: 40,
				maxOutputTokens: 100000,
				responseMimeType: 'text/plain'
			};

			// Initialize Gemini.
			const apiKey = PUBLIC_GEMINI_KEY;
			const genAI = new GoogleGenerativeAI(apiKey);
			const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
			const chat = model.startChat({ history, generationConfig });

			// Send an empty prompt because instructions are in the history.
			const streamResult = await chat.sendMessageStream('');

			// Process each chunk as it arrives.
			for await (const chunk of streamResult.stream) {
				const textChunk = chunk.text();
				streamBuffer += textChunk;
				// Look for complete JSON objects using a simple regex.
				const regex = /{[^{}]*}/g;
				let match;
				while ((match = regex.exec(streamBuffer)) !== null) {
					try {
						const obj = JSON.parse(match[0]);
						// If the object has a "tests" key, treat it as the tests payload.
						if ('tests' in obj) {
							testsData = obj.tests;
							testsData = testsData;
						} else {
							// Otherwise, assume it’s a data row.
							if (!tableRows.some((row) => JSON.stringify(row) === JSON.stringify(obj))) {
								tableRows = [...tableRows, obj];
								tableRows = tableRows;
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

	// Open schema editor for the selected schema.
	function editSchema() {
		if (selectedSchemaIndex >= 0) {
			editingSchemaIndex = selectedSchemaIndex;
			newSchema = { ...schemas[selectedSchemaIndex] };
			newSchema = newSchema;
			newSchemaModal = true;
		}
	}

	// Generate a CSV string from tableRows.
	function generateCSV() {
		if (!tableRows.length) return '';
		const headers = Object.keys(tableRows[0]);
		const csvRows = [
			headers.join(','), // header row
			...tableRows.map(row => headers.map(header => row[header]).join(','))
		];
		return csvRows.join('\n');
	}

	// Helper to pad numbers.
	function pad(num) {
		return num.toString().padStart(2, '0');
	}

	// Generate destination path based on the xref mapping and current date.
	function getDestinationPath(fileName) {
		// Look for a matching pattern.
		for (const pattern in xref) {
			// A simple check: if fileName starts with the same prefix (before the asterisk) and ends with the same suffix.
			const [prefix, suffix] = pattern.split('*');
			if (fileName.startsWith(prefix) && fileName.endsWith(suffix)) {
				let template = xref[pattern];
				const today = new Date();
				const yyyy = today.getFullYear();
				const mm = pad(today.getMonth() + 1);
				const dd = pad(today.getDate());
				// Replace date tokens.
				template = template.replace('{yyyy}', yyyy).replace('{mm}', mm).replace('{dd}', dd);
				// Replace the asterisk with the dynamic portion.
				// In this example, we assume the dynamic part is everything between the prefix and suffix.
				const dynamicPart = fileName.substring(prefix.length, fileName.length - suffix.length);
				template = template.replace('*', dynamicPart);
				return template;
			}
		}
		// Fallback: return the original file name.
		return fileName;
	}

	// Upload the generated CSV to Cloudflare R2.
	async function uploadCSV() {
		// Generate CSV content from tableRows.
		const csvContent = generateCSV();
		if (!csvContent) {
			console.error('No data to upload.');
			return;
		}
		// Generate a file name using the pattern "example_YYYY_MM_DD.csv".
		const today = new Date();
		const yyyy = today.getFullYear();
		const mm = pad(today.getMonth() + 1);
		const dd = pad(today.getDate());
		const fileName = `example_${yyyy}_${mm}_${dd}.csv`;
		const destinationPath = getDestinationPath(fileName);
		console.log('Uploading to:', destinationPath);

		try {
			// Create a Blob from the CSV string.
			const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
			const formData = new FormData();
			formData.append('file', blob, fileName);
			formData.append('destinationPath', destinationPath);

			// Call your API endpoint that handles the Cloudflare R2 upload.
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

<div class="space-y-4 p-4">
	<!-- Top controls -->
	<div class="flex items-center justify-between">
		{#if !extractionInProgress && testsData}
			<button class="btn btn-info" on:click={() => (showValidation = !showValidation)}>
				{showValidation ? 'Hide Validation' : 'Show Validation'}
			</button>
		{/if}
	</div>

	<!-- File upload and schema selection -->
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
			<button
				class="btn btn-secondary"
				on:click={extractFile}
				disabled={extractionInProgress || !file}
			>
				{extractionInProgress ? 'Extracting...' : 'Extract File'}
			</button>
		</div>
		<div class="form-control">
			<button class="btn btn-success" on:click={uploadCSV} disabled={!tableRows.length}>
				Upload Data to R2
			</button>
		</div>
	</div>

	<!-- New/Edit Schema Modal -->
	{#if newSchemaModal}
		<div class="modal modal-open">
			<div class="modal-box">
				<h3 class="text-lg font-bold">
					{editingSchemaIndex !== -1 ? 'Edit Schema' : 'New Schema'}
				</h3>
				<div class="form-control mt-4">
					<label class="label">
						<span class="label-text">Schema Name</span>
					</label>
					<input
						type="text"
						bind:value={newSchema.schemaName}
						class="input input-bordered"
						placeholder="Enter schema name"
					/>
				</div>
				<div class="form-control mt-4">
					<label class="label">
						<span class="label-text">Table Name</span>
					</label>
					<input
						type="text"
						bind:value={newSchema.tableName}
						class="input input-bordered"
						placeholder="Enter table name"
					/>
				</div>
				<div class="mt-4">
					<label class="label">Columns</label>
					{#each newSchema.columns as col, i}
						<div class="mb-2 flex items-center gap-2">
							<input
								type="text"
								bind:value={col.name}
								placeholder="Column Name"
								class="input input-bordered flex-1"
							/>
							<select bind:value={col.type} class="select select-bordered">
								<option value="VARCHAR">VARCHAR</option>
								<option value="INT">INT</option>
								<option value="FLOAT">FLOAT</option>
								<option value="DATE">DATE</option>
							</select>
						</div>
					{/each}
					<button class="btn btn-sm btn-outline" on:click={addColumn}>Add Column</button>
				</div>
				<div class="form-control mt-4">
					<label class="label">
						<span class="label-text">Comments</span>
					</label>
					<textarea
						bind:value={newSchema.comments}
						class="textarea textarea-bordered"
						placeholder="Enter any comments..."
					></textarea>
				</div>
				<div class="form-control mt-4">
					<label class="label">
						<span class="label-text">Validation Exceptions</span>
					</label>
					<textarea
						bind:value={newSchema.validations}
						class="textarea textarea-bordered"
						placeholder="Enter validations or exceptions to watch for..."
					></textarea>
				</div>
				<div class="modal-action">
					<button
						class="btn btn-secondary"
						on:click={() => {
							newSchemaModal = false;
							editingSchemaIndex = -1;
						}}>Cancel</button>
					<button class="btn btn-primary" on:click={saveNewSchema}>Save</button>
				</div>
			</div>
		</div>
	{/if}

	<!-- Display Extracted Data -->
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

	<!-- Display Validation Results if toggled (PDF only) -->
	{#if showValidation && testsData}
		<div class="card bg-base-200 p-4">
			<h3 class="card-title">Validation Results</h3>
			<pre class="whitespace-pre-wrap">{JSON.stringify(testsData, null, 2)}</pre>
		</div>
	{/if}
</div>
