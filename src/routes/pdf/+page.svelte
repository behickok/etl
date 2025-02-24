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

	// Schemas (persisted in localStorage)
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
    newSchema=newSchema
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
      schemas=schemas
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

	// Function to upload the file and extract content via Gemini.
	async function extractPDF() {
		if (!file) return;
		extractionInProgress = true;
		streamBuffer = '';
		tableRows = [];
		testsData = null;
		showValidation = false;

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
			let promptBase = '';

			promptBase += `Please extract the holdings table from the attached PDF.
Extract the following table:`;

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
				<span class="label-text">Upload PDF</span>
			</label>
			<input
				type="file"
				accept="application/pdf"
				class="file-input file-input-bordered"
				on:change={handleFileChange}
			/>
		</div>
		<div class="form-control">
			<label class="label">
				<span class="label-text">Select Schema</span>
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
				on:click={extractPDF}
				disabled={extractionInProgress || !file}
			>
				{extractionInProgress ? 'Extracting...' : 'Extract PDF'}
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
						}}>Cancel</button
					>
					<button class="btn btn-primary" on:click={saveNewSchema}>Save</button>
				</div>
			</div>
		</div>
	{/if}

	<!-- Display Extracted Table -->
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

	<!-- Display Validation Results if toggled -->
	{#if showValidation && testsData}
		<div class="card bg-base-200 p-4">
			<h3 class="card-title">Validation Results</h3>
			<pre class="whitespace-pre-wrap">{JSON.stringify(testsData, null, 2)}</pre>
		</div>
	{/if}
</div>
