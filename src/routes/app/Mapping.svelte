<script>
	import { onMount } from 'svelte';
	import { mappingStore, authStore } from '$lib/store.js';
	import { get } from 'svelte/store';
	import initMotherDuckConnection from '$lib/MDInit.js';
	import SchemasManager from './SchemasManager.svelte';

	// --- TAB MANAGEMENT ---
	let activeTab = 'mapping'; // Options: "mapping", "schemas", "reports"

	// --- MAPPING STORE DATA ---
	// mappingRows comes from the store.
	let mappingRows = [];
	// We'll compute mappingColumns from the store data.
	let mappingColumns = [];
	const defaultColumns = [
		"source_index",
		"file_name",
		"source",
		"path",
		"domain",
		"input_field_name",
		"output_field_name",
		"type",
		"calculation",
		"notes"
	];

	// Reactive statement: update local variables whenever the store changes.
	$: {
		mappingRows = $mappingStore;
		mappingColumns = mappingRows && mappingRows.length > 0
			? Object.keys(mappingRows[0])
			: defaultColumns;
	}

	// --- EDITING / FORM STATE ---
	let editingRow = null;
	let formData = {};
	let isNew = false;
	let error = '';

	function editRow(row) {
		if (!canEdit) return;
		editingRow = row;
		formData = { ...row };
		isNew = false;
	}

	function addNewRow() {
		if (!canEdit) return;
		editingRow = {};
		formData = {};
		for (const col of defaultColumns) {
			formData[col] = col === "source_index" ? 0 : "";
		}
		isNew = true;
		mappingColumns = defaultColumns;
	}

	// --- UPDATE/INSERT/DELETE FUNCTIONS ---
	async function updateMapping() {
		try {
			const connection = await initMotherDuckConnection($authStore.user.protectedProfile.client);
			if (!connection) throw new Error("Connection not available");

			if (!isNew) {
				// Update an existing row (using composite primary key: source_index, source, domain)
				const { source_index, source, domain, file_name, path, input_field_name, output_field_name, type, calculation, notes } = formData;
				const updateQuery = `
					UPDATE mapping
					SET file_name = '${file_name}', path = '${path}', 
					    input_field_name = '${input_field_name}', output_field_name = '${output_field_name}', 
					    type = '${type}', calculation = '${calculation}', notes = '${notes}'
					WHERE source_index = ${source_index} 
					  AND source = '${source}' 
					  AND domain = '${domain}';
				`;
				await connection.safeEvaluateQuery(updateQuery);
			} else {
				// Insert a new row
				const { source_index, file_name, source, path, domain, input_field_name, output_field_name, type, calculation, notes } = formData;
				const insertQuery = `
					INSERT INTO mapping (source_index, file_name, source, path, domain, input_field_name, output_field_name, type, calculation, notes)
					VALUES (${source_index}, '${file_name}', '${source}', '${path}', '${domain}', '${input_field_name}', '${output_field_name}', '${type}', '${calculation}', '${notes}');
				`;
				await connection.safeEvaluateQuery(insertQuery);
			}

			editingRow = null;
			formData = {};
			await refreshMapping();
		} catch (e) {
			error = e.message;
			console.error("Update/Insert error", e);
		}
	}

	async function deleteRow(row) {
		try {
			const connection = await initMotherDuckConnection($authStore.user.protectedProfile.client);
			if (!connection) throw new Error("Connection not available");
			const { source_index, source, domain } = row;
			const deleteQuery = `
				DELETE FROM mapping
				WHERE source_index = ${source_index} 
				  AND source = '${source}' 
				  AND domain = '${domain}';
			`;
			await connection.safeEvaluateQuery(deleteQuery);
			await refreshMapping();
		} catch (e) {
			error = e.message;
			console.error("Delete error", e);
		}
	}

	// --- REFRESH FUNCTION ---
	async function refreshMapping() {
		try {
			const connection = await initMotherDuckConnection($authStore.user.protectedProfile.client);
			if (connection) {
				const query = 'SELECT * FROM mapping;';
				const queryResult = await connection.safeEvaluateQuery(query);
				if (queryResult && queryResult.result) {
					mappingStore.set(queryResult.result.data.toRows());
				}
			}
		} catch (e) {
			error = e.message;
			console.error("Error refreshing mapping:", e);
		}
	}

	// Optionally, onMount you might want to refresh the mapping store if it isn’t already populated.
	onMount(async () => {
		if (get(mappingStore).length === 0) {
			await refreshMapping();
		}
	});

	// --- ROLE-BASED ACCESS ---
	$: canEdit = $authStore.user?.protectedProfile?.role === 'Admin' ||
	             $authStore.user?.protectedProfile?.role === 'Writer';
</script>

<div class="p-4">
	<h2 class="text-2xl font-bold mb-4">Mapping</h2>

	<!-- Tab Navigation -->
	<div class="tabs mb-4">
		<button class="tab tab-lifted" class:tab-active={activeTab === 'mapping'} on:click={() => activeTab = 'mapping'}>
			Mapping
		</button>
		<button class="tab tab-lifted" class:tab-active={activeTab === 'schemas'} on:click={() => activeTab = 'schemas'}>
			Schemas
		</button>
		<button class="tab tab-lifted" class:tab-active={activeTab === 'reports'} on:click={() => activeTab = 'reports'}>
			Reports
		</button>
	</div>

	{#if activeTab === 'mapping'}
		<div class="flex flex-col md:flex-row gap-4">
			<!-- Left: Mapping Table -->
			<div class="flex-1 overflow-x-auto">
				{#if error}
					<div class="alert alert-error mb-4">{error}</div>
				{/if}
				<table class="table w-full">
					<thead>
						<tr>
							{#each mappingColumns as col}
								<th>{col}</th>
							{/each}
							{#if canEdit}
								<th>Actions</th>
							{/if}
						</tr>
					</thead>
					<tbody>
						{#each mappingRows as row}
							<tr>
								{#each mappingColumns as col}
									<td>{row[col]}</td>
								{/each}
								{#if canEdit}
									<td class="whitespace-nowrap">
										<button class="btn btn-sm btn-primary mr-2" on:click={() => editRow(row)}>
											Edit
										</button>
										<button class="btn btn-sm btn-error" on:click={() => deleteRow(row)}>
											Delete
										</button>
									</td>
								{/if}
							</tr>
						{/each}
					</tbody>
				</table>
				{#if canEdit}
					<button class="btn btn-secondary mt-4" on:click={addNewRow}>Add New Row</button>
				{/if}
			</div>

			<!-- Right: Edit / Add Form (only visible if user can edit) -->
			{#if canEdit && editingRow !== null}
				<div class="flex-1 p-4 border rounded">
					<h3 class="text-xl font-bold mb-4">{isNew ? "Add New Row" : "Edit Row"}</h3>
					<form on:submit|preventDefault={updateMapping}>
						{#each mappingColumns as col}
							<div class="mb-2">
								<label class="block text-sm font-medium">{col}</label>
								<input type="text" class="input input-bordered w-full" bind:value={formData[col]} />
							</div>
						{/each}
						<div class="flex gap-2 mt-4">
							<button type="submit" class="btn btn-primary">{isNew ? "Insert" : "Update"}</button>
							<button type="button" class="btn btn-secondary" on:click={() => { editingRow = null; formData = {}; }}>
								Cancel
							</button>
						</div>
					</form>
				</div>
			{/if}
		</div>
	{:else if activeTab === 'schemas'}
		<!-- Schemas Tab: SchemaManager Component -->
		<SchemasManager />
	{:else if activeTab === 'reports'}
		<!-- Reports Tab: Placeholder -->
		<div>
			<h3 class="text-xl font-bold">Reports</h3>
			<p>Reports coming soon.</p>
		</div>
	{/if}
</div>
