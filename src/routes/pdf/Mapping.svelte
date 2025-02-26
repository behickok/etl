<script>
	import { onMount } from 'svelte';
	import initMotherDuckConnection from '$lib/MDInit.js';

	// --- STATE VARIABLES ---
	let mappingRows = [];
	let mappingColumns = [];
	let error = '';

	// When a row is being edited (or a new row is being added), we store the row in editingRow.
	// If editingRow is null, no edit form is shown.
	let editingRow = null;
	// formData holds the current form values for the row being edited/added.
	let formData = {};
	// Flag to indicate whether we're inserting a new row (true) or editing an existing row (false)
	let isNew = false;

	// --- HELPER: Parse columns (if the table is empty, use default columns) ---
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

	// --- FUNCTION: Load the mapping table ---
	async function loadMapping() {
		error = '';
		try {
			const connection = await initMotherDuckConnection("stratum");
			if (connection) {
				const query = 'SELECT * FROM mapping;';
				const queryResult = await connection.safeEvaluateQuery(query);
				if (queryResult && queryResult.result) {
					mappingRows = queryResult.result.data.toRows();
					// Use the keys from the first row, if available.
					mappingColumns =
						mappingRows.length > 0
							? Object.keys(mappingRows[0])
							: defaultColumns;
				}
			}
		} catch (e) {
			console.error('Error loading mapping:', e);
			error = e.message;
		}
	}

	onMount(() => {
		loadMapping();
	});

	// --- FUNCTION: Bring up the form to edit an existing row ---
	function editRow(row) {
		editingRow = row;
		formData = { ...row };
		isNew = false;
	}

	// --- FUNCTION: Bring up a blank form to add a new row ---
	function addNewRow() {
		editingRow = {};
		formData = {};
		for (const col of defaultColumns) {
			formData[col] = col === "source_index" ? 0 : "";
		}
		isNew = true;
		// Ensure the columns are set (in case the table was empty)
		mappingColumns = defaultColumns;
	}

	// --- FUNCTION: Update (or insert) the row in DuckDB ---
	async function updateMapping() {
		try {
			const connection = await initMotherDuckConnection("stratum");
			if (!connection) throw new Error("Connection not available");

			if (!isNew) {
				// Update the existing row. Use the composite primary key: source_index, source, domain.
				const {
					source_index,
					source,
					domain,
					file_name,
					path,
					input_field_name,
					output_field_name,
					type,
					calculation,
					notes
				} = formData;
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
				const {
					source_index,
					file_name,
					source,
					path,
					domain,
					input_field_name,
					output_field_name,
					type,
					calculation,
					notes
				} = formData;
				const insertQuery = `
					INSERT INTO mapping (source_index, file_name, source, path, domain, input_field_name, output_field_name, type, calculation, notes)
					VALUES (${source_index}, '${file_name}', '${source}', '${path}', '${domain}', '${input_field_name}', '${output_field_name}', '${type}', '${calculation}', '${notes}');
				`;
				await connection.safeEvaluateQuery(insertQuery);
			}

			editingRow = null;
			formData = {};
			await loadMapping();
		} catch (e) {
			error = e.message;
			console.error("Update/Insert error", e);
		}
	}

	// --- FUNCTION: Delete a row using its primary key ---
	async function deleteRow(row) {
		try {
			const connection = await initMotherDuckConnection("stratum");
			if (!connection) throw new Error("Connection not available");
			const { source_index, source, domain } = row;
			const deleteQuery = `
				DELETE FROM mapping
				WHERE source_index = ${source_index} 
				  AND source = '${source}' 
				  AND domain = '${domain}';
			`;
			await connection.safeEvaluateQuery(deleteQuery);
			await loadMapping();
		} catch (e) {
			error = e.message;
			console.error("Delete error", e);
		}
	}
</script>

<div class="p-4">
	<h2 class="text-2xl font-bold mb-4">Mapping Table</h2>

	{#if error}
		<div class="alert alert-error mb-4">
			{error}
		</div>
	{/if}

	<!-- Main container: flex layout (stacked on small screens, side-by-side on medium and above) -->
	<div class="flex flex-col md:flex-row gap-4">
		<!-- Left: Mapping Table -->
		<div class="flex-1 overflow-x-auto">
			<table class="table w-full">
				<thead>
					<tr>
						{#each mappingColumns as col}
							<th>{col}</th>
						{/each}
						<th>Actions</th>
					</tr>
				</thead>
				<tbody>
					{#each mappingRows as row}
						<tr>
							{#each mappingColumns as col}
								<td>{row[col]}</td>
							{/each}
							<td class="whitespace-nowrap">
								<button class="btn btn-sm btn-primary mr-2" on:click={() => editRow(row)}>Edit</button>
								<button class="btn btn-sm btn-error" on:click={() => deleteRow(row)}>Delete</button>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
			<button class="btn btn-secondary mt-4" on:click={addNewRow}>Add New Row</button>
		</div>

		<!-- Right: Edit / Add Form -->
		{#if editingRow !== null}
			<div class="flex-1 p-4 border rounded">
				<h3 class="text-xl font-bold mb-4">{isNew ? "Add New Row" : "Edit Row"}</h3>
				<form on:submit|preventDefault={updateMapping}>
					{#each mappingColumns as col}
						<div class="mb-2">
							<label class="block text-sm font-medium">{col}</label>
							<input
								type="text"
								class="input input-bordered w-full"
								bind:value={formData[col]}
							/>
						</div>
					{/each}
					<div class="flex gap-2 mt-4">
						<button type="submit" class="btn btn-primary">
							{isNew ? "Insert" : "Update"}
						</button>
						<button type="button" class="btn btn-secondary" on:click={() => { editingRow = null; formData = {}; }}>
							Cancel
						</button>
					</div>
				</form>
			</div>
		{/if}
	</div>
</div>
