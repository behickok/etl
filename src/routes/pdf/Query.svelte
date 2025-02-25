<script>
	import { onMount } from 'svelte';
	// Adjust the import below based on your actual MotherDuck package name and API.
	import initMotherDuckConnection from '$lib/MDInit.js';

	let client; // Holds the MotherDuck client instance.
	let query = 'SELECT * FROM nyc.taxi LIMIT 10;' // The query text entered by the user.
	let resultRows = []; // Array of result rows (each row is an object).
	let resultColumns = []; // Array of column names.
	let error = ''; // Holds any error messages.

	async function runQuery(sql) {
		error = '';
		try {
			console.log('SQL', sql);
			const connection = await initMotherDuckConnection("sample_data");
			if (connection) {
				try {
					const queryResult = await connection.safeEvaluateQuery(sql);
					if (queryResult && queryResult.result) {
						// Convert to rows and update component state
						const result = queryResult.result.data.toRows();
						console.log('Result', result);
						resultRows = result;
						// If at least one row is returned, set the columns from its keys
						if (resultRows.length > 0) {
							resultColumns = Object.keys(resultRows[0]);
						} else {
							resultColumns = [];
						}
					}
				} catch (err) {
					console.log('Query failed', err);
					error = 'Query failed: ' + err.message;
				}
			}
		} catch (e) {
			console.error('Error initializing MotherDuck connection:', e);
			error = 'Connection error: ' + e.message;
		}
	}
</script>

<div class="p-4">
	<!-- Query Input -->
	<div class="mb-4">
		<label class="mb-2 block text-sm font-medium">Enter Query:</label>
		<input
			type="text"
			bind:value={query}
			placeholder="select 42"
			class="input input-bordered w-full"
		/>
	</div>
	<button class="btn btn-primary mb-4" on:click={() => runQuery(query)}>
		Run Query
	</button>

	<!-- Display errors if any -->
	{#if error}
		<div class="alert alert-error mb-4">
			{error}
		</div>
	{/if}

	<!-- Results Table -->
	{#if resultRows.length}
		<div class="overflow-x-auto">
			<table class="table w-full">
				<thead>
					<tr>
						{#each resultColumns as col}
							<th>{col}</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each resultRows as row}
						<tr>
							{#each resultColumns as col}
								<td>{row[col]}</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>
