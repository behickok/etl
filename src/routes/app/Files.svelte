<script>
	import { onMount } from 'svelte';
	import initMotherDuckConnection from '$lib/MDInit.js';
	import {authStore} from '$lib/store'
	import Extraction from './Extraction.svelte';

	// --- VIEW MODE ---
	// Modes: 'browser' | 'extraction' | 'fileContent'
	let viewMode = 'browser';

	// --- FILE BROWSER STATE ---
	let files = [];
	let fileError = null;
	let fileLoading = true;

	// --- FILE SELECTED FOR EDITING ---
	let selectedFile = null;

	// --- MOTHERDUCK QUERY / EDITABLE TABLE STATE ---
	let queryResultRows = [];
	let queryResultColumns = [];
	let queryError = '';
	let queryLoading = false;
	let editableRows = [];

	// --- HELPER: Parse S3 key into directory & file name ---
	function parsePath(key) {
		const parts = key.split('/');
		const fileName = parts.pop();
		const directoryPath = parts.join('/');
		return { directoryPath, fileName };
	}

	// --- HELPER: Convert array of objects to CSV string ---
	function convertToCSV(rows, columns) {
		const header = columns.join(',');
		const csvRows = rows.map(row =>
			columns
				.map(col => `"${String(row[col] || '').replace(/"/g, '""')}"`)
				.join(',')
		);
		return [header, ...csvRows].join('\n');
	}

	// --- HELPER: Fetch files from the API ---
	async function fetchFiles() {
		fileLoading = true;
		try {
			const res = await fetch(`/api/r2list?client=${$authStore.user.protectedProfile.client}`);
			if (!res.ok) {
				throw new Error('Failed to fetch files');
			}
			const data = await res.json();
			files = (data.files || []).map(file => {
				const { directoryPath, fileName } = parsePath(file.key);
				return { ...file, directoryPath, fileName };
			});
		} catch (err) {
			fileError = err.message;
		} finally {
			fileLoading = false;
		}
	}

	// --- On component mount, fetch file list ---
	onMount(() => {
		fetchFiles();
	});

	// --- FILE BROWSER: Switch to file content view ---
	async function viewFileContents(file) {
		selectedFile = file;
		viewMode = 'fileContent';
		queryLoading = true;
		queryError = '';
		queryResultRows = [];
		queryResultColumns = [];
		editableRows = [];

		try {
			const sql = `SELECT * FROM read_csv_auto('r2://${$authStore.user.protectedProfile.client}/${file.key}') LIMIT 100;`;
			const connection = await initMotherDuckConnection('sample_data');
			if (!connection) {
				throw new Error('Could not establish MotherDuck connection');
			}
			const queryResponse = await connection.safeEvaluateQuery(sql);
			if (queryResponse && queryResponse.result) {
				const rows = queryResponse.result.data.toRows();
				// Convert BigInt values to strings during JSON serialization.
				const rowsSafe = JSON.parse(
					JSON.stringify(rows, (key, value) =>
						typeof value === 'bigint' ? value.toString() : value
					)
				);

				queryResultRows = rowsSafe;
				if (rowsSafe.length > 0) {
					queryResultColumns = Object.keys(rowsSafe[0]);
				}
				// Initialize editableRows as a deep copy.
				editableRows = JSON.parse(JSON.stringify(rowsSafe));
			}
		} catch (err) {
			console.error('MotherDuck Query Error:', err);
			queryError = 'Query failed: ' + err.message;
		} finally {
			queryLoading = false;
		}
	}

	// --- FILE CONTENT: Update cell content on blur (instead of every keystroke) ---
	function handleCellBlur(rowIndex, col, event) {
		editableRows[rowIndex][col] = event.target.innerText;
	}

	// --- FILE CONTENT: Add a new row ---
	function addRow() {
		const newRow = {};
		queryResultColumns.forEach(col => (newRow[col] = ''));
		editableRows = [...editableRows, newRow];
	}

	// --- FILE CONTENT: Remove a row by index ---
	function removeRow(index) {
		editableRows = editableRows.filter((_, i) => i !== index);
	}

	// --- FILE CONTENT: Re-upload updated CSV using /api/r2upload ---
	async function updateFile() {
		const csvString = convertToCSV(editableRows, queryResultColumns);
		const blob = new Blob([csvString], { type: 'text/csv' });
		const fileName = selectedFile.fileName || 'updated.csv';

		const formData = new FormData();
		formData.append('destinationPath', selectedFile.key);
		formData.append('file', blob, fileName);
		formData.append('client', $authStore.user.protectedProfile.client);

		try {
			const res = await fetch('/api/r2upload', {
				method: 'POST',
				body: formData
			});
			if (!res.ok) {
				throw new Error('Upload failed.');
			}
			alert('File updated successfully.');
		} catch (err) {
			alert('Error updating file: ' + err.message);
		}
	}

	// --- FILE CONTENT: Download the CSV ---
	function downloadCSV() {
		const csvString = convertToCSV(editableRows, queryResultColumns);
		const blob = new Blob([csvString], { type: 'text/csv' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = selectedFile.fileName || 'download.csv';
		a.click();
		URL.revokeObjectURL(url);
	}

	// --- NAVIGATION: Return to File Browser ---
	function returnToFileBrowser() {
		viewMode = 'browser';
		selectedFile = null;
		queryResultRows = [];
		queryResultColumns = [];
		queryError = '';
		queryLoading = false;
	}

	// --- NAVIGATION: Switch to Extraction (Upload) View ---
	function openExtraction() {
		viewMode = 'extraction';
	}

	// --- NAVIGATION: Return from Extraction to Browser ---
	async function returnFromExtraction() {
		viewMode = 'browser';
		await fetchFiles();
	}
</script>

<!-- VIEW: File Browser -->
{#if viewMode === 'browser'}
	<div class="p-4">
		<div class="flex justify-between items-center mb-4">
			<h2 class="text-2xl font-bold">File Browser</h2>
			<button class="btn btn-secondary" on:click={openExtraction}>Load</button>
		</div>

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
							<th class="bg-base-200">Actions</th>
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
										class="btn btn-sm btn-primary"
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

<!-- VIEW: Extraction (Upload) -->
{:else if viewMode === 'extraction'}
	<div class="p-4">
		<div class="flex justify-between items-center mb-4">
			<h2 class="text-2xl font-bold">Upload Files</h2>
			<button class="btn btn-secondary" on:click={returnFromExtraction}>
				Back to Browser
			</button>
		</div>
		<Extraction />
	</div>

<!-- VIEW: File Content (Editable) -->
{:else if viewMode === 'fileContent'}
	<div class="p-4">
		<div class="flex justify-between items-center mb-2">
			<div>
				<h2 class="text-2xl font-bold">Viewing File: {selectedFile?.fileName}</h2>
				<p class="text-sm text-gray-500">Path: {selectedFile?.key}</p>
			</div>
			<button class="btn btn-secondary" on:click={returnToFileBrowser}>
				Back to Browser
			</button>
		</div>

		{#if queryError}
			<div class="alert alert-error mb-4">{queryError}</div>
		{/if}

		{#if queryLoading}
			<div class="alert alert-info mb-4 flex items-center">
				<span class="loading loading-spinner text-primary"></span>
				<span class="ml-2">Loading data, please wait...</span>
			</div>
		{:else if queryResultRows.length === 0}
			<div class="alert alert-info mb-4">
				No rows found or file is empty.
			</div>
		{/if}

		{#if !queryLoading && queryResultRows.length > 0}
			<div class="overflow-x-auto mb-4">
				<table class="table w-full">
					<thead>
						<tr>
							{#each queryResultColumns as col}
								<th class="bg-base-200">{col}</th>
							{/each}
							<th class="bg-base-200">Actions</th>
						</tr>
					</thead>
					<tbody>
						{#each editableRows as row, rowIndex}
							<tr>
								{#each queryResultColumns as col}
									<td
										contenteditable="true"
										on:blur={(e) => handleCellBlur(rowIndex, col, e)}
									>
										{row[col]}
									</td>
								{/each}
								<td>
									<button
										class="btn btn-sm btn-error"
										on:click={() => removeRow(rowIndex)}
									>
										Delete
									</button>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			<div class="flex gap-2">
				<button class="btn btn-accent" on:click={addRow}>
					Add Row
				</button>
				<button class="btn btn-primary" on:click={updateFile}>
					Update
				</button>
				<button class="btn btn-outline" on:click={downloadCSV}>
					Download CSV
				</button>
			</div>
		{/if}
	</div>
{/if}
