<script>
	import { onMount } from 'svelte';
	import initMotherDuckConnection from '$lib/MDInit.js';

	// ----- FILE LISTING STATE -----
	let files = [];
	let fileError = null;
	let fileLoading = true;

	// ----- TOGGLE BETWEEN FILE BROWSER & FILE CONTENT VIEW -----
	let showFileList = true;
	let selectedFile = null; // Will store the file object once clicked

	// ----- MOTHERDUCK QUERY STATE -----
	let queryResultRows = [];
	let queryResultColumns = [];
	let queryError = '';
	let queryLoading = false; // <-- NEW: loading state for queries

	/**
	 * Helper function to parse the "directory path" vs. "file name" from the S3 key
	 */
	function parsePath(key) {
		const parts = key.split('/');
		const fileName = parts.pop();
		const directoryPath = parts.join('/');
		return { directoryPath, fileName };
	}

	/**
	 * Fetch file list on mount (calls /api/r2list instead of /api/listFiles)
	 */
	onMount(async () => {
		try {
			const res = await fetch('/api/r2list');
			if (!res.ok) {
				throw new Error('Failed to fetch files');
			}
			const data = await res.json();
			files = (data.files || []).map((file) => {
				const { directoryPath, fileName } = parsePath(file.key);
				return {
					...file,
					directoryPath,
					fileName
				};
			});
		} catch (err) {
			fileError = err.message;
		} finally {
			fileLoading = false;
		}
	});

	/**
	 * When a file is clicked, switch to the file content view
	 * and run a MotherDuck query to read its contents.
	 */
	async function viewFileContents(file) {
		selectedFile = file;
		showFileList = false;
		queryLoading = true;   // <-- Mark as loading
		queryError = '';
		queryResultRows = [];
		queryResultColumns = [];

		await runQuery(`SELECT * FROM read_csv_auto('r2://stratum/${file.key}') LIMIT 100;`);

		queryLoading = false;  // <-- Done loading
	}

	/**
	 * Return to the file browser
	 */
	function returnToFileBrowser() {
		showFileList = true;
		selectedFile = null;
		queryResultRows = [];
		queryResultColumns = [];
		queryError = '';
		queryLoading = false;
	}

	/**
	 * Runs a query against MotherDuck
	 */
	async function runQuery(sql) {
		try {
			const connection = await initMotherDuckConnection("sample_data");
			if (!connection) {
				throw new Error("Could not establish MotherDuck connection");
			}

			// Attempt the query
			const queryResponse = await connection.safeEvaluateQuery(sql);
			if (queryResponse && queryResponse.result) {
				const rows = queryResponse.result.data.toRows();
				queryResultRows = rows;
				if (rows.length > 0) {
					queryResultColumns = Object.keys(rows[0]);
				}
			}
		} catch (err) {
			console.error('MotherDuck Query Error:', err);
			queryError = 'Query failed: ' + err.message;
		}
	}
</script>

<!-- FILE BROWSER VIEW -->
{#if showFileList}
	<div class="p-4">
		<h2 class="text-2xl font-bold mb-4">File Browser</h2>

		{#if fileLoading}
			<div class="flex items-center">
				<span class="loading loading-spinner text-primary"></span>
				<span class="ml-2">Loading files...</span>
			</div>
		{:else if fileError}
			<div class="alert alert-error">
				<span>Error: {fileError}</span>
			</div>
		{:else if files.length === 0}
			<div class="alert alert-info">
				<span>No files found.</span>
			</div>
		{:else}
			<div class="overflow-x-auto mt-4">
				<table class="table table-zebra w-full">
					<thead>
						<tr>
							<th class="bg-base-200">Path</th>
							<th class="bg-base-200">File</th>
							<th class="bg-base-200">Last Modified</th>
							<th class="bg-base-200">Size (bytes)</th>
							<th class="bg-base-200"></th>
						</tr>
					</thead>
					<tbody>
						{#each files as file}
							<tr>
								<td>{file.directoryPath}</td>
								<td>{file.fileName}</td>
								<td>{new Date(file.lastModified).toLocaleString()}</td>
								<td>{file.size}</td>
								<td>
									<button
										class="btn btn-sm btn-outline"
										on:click={() => viewFileContents(file)}
									>
										View
									</button>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</div>

<!-- FILE CONTENT VIEW -->
{:else}
	<div class="p-4">
		<h2 class="text-2xl font-bold mb-2">Viewing File: {selectedFile?.fileName}</h2>
		<p class="text-sm text-gray-500 mb-4">Path: {selectedFile?.key}</p>

		<!-- Error message for query issues -->
		{#if queryError}
			<div class="alert alert-error mb-4">{queryError}</div>
		{/if}

		<!-- Show loading spinner if data is still loading -->
		{#if queryLoading}
			<div class="alert alert-info mb-4 flex items-center">
				<span class="loading loading-spinner text-primary"></span>
				<span class="ml-2">Loading data, please wait...</span>
			</div>
		{:else if queryResultRows.length > 0}
			<div class="overflow-x-auto mb-4">
				<table class="table w-full">
					<thead>
						<tr>
							{#each queryResultColumns as col}
								<th>{col}</th>
							{/each}
						</tr>
					</thead>
					<tbody>
						{#each queryResultRows as row}
							<tr>
								{#each queryResultColumns as col}
									<td>{row[col]}</td>
								{/each}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{:else}
			<div class="alert alert-info mb-4">
				No rows found or file is empty.
			</div>
		{/if}

		<!-- Button to return to file browser -->
		<button class="btn btn-link" on:click={returnToFileBrowser}>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-arrow-left-short" viewBox="0 0 16 16">
                <path fill-rule="evenodd" d="M12 8a.5.5 0 0 1-.5.5H5.707l2.147 2.146a.5.5 0 0 1-.708.708l-3-3a.5.5 0 0 1 0-.708l3-3a.5.5 0 1 1 .708.708L5.707 7.5H11.5a.5.5 0 0 1 .5.5"/>
              </svg>
			Return to File Browser
		</button>
	</div>
{/if}
