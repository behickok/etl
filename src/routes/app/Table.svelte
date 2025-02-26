<script>
	import { onMount } from 'svelte';
	import initMotherDuckConnection from '$lib/MDInit.js';
	import {authStore} from '$lib/store'
	export let activeItem;

	let queryResults = [];
	let queryColumns = [];
	let error = '';
	let loading = true;

	async function runQuery() {
		loading = true;
		try {
			const connection = await initMotherDuckConnection($authStore.user.protectedProfile.client);
			const query = `SELECT * FROM ${activeItem.parameter};`;
			const queryResult = await connection.safeEvaluateQuery(query);
			if (queryResult && queryResult.result) {
				queryResults = queryResult.result.data.toRows();
				if (queryResults.length > 0) {
					queryColumns = Object.keys(queryResults[0]);
				} else {
					queryColumns = [];
				}
			}
		} catch (e) {
			error = e.message;
		} finally {
			loading = false;
		}
	}

	// Run the query on mount.
	onMount(() => {
		runQuery();
	});

	// Reactive block to run the query whenever activeItem changes.
	$: if (activeItem) {
		runQuery();
	}
</script>

<div>
	<h2 class="text-2xl font-bold mb-4">Data for {activeItem.parameter}</h2>
	{#if loading}
		<p>Loading data...</p>
	{:else if error}
		<p class="text-red-600">Error: {error}</p>
	{:else if queryResults.length === 0}
		<p>No data returned.</p>
	{:else}
		<div class="overflow-x-auto">
			<table class="table w-full">
				<thead>
					<tr>
						{#each queryColumns as col}
							<th class="px-4 py-2">{col}</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each queryResults as row}
						<tr>
							{#each queryColumns as col}
								<td class="px-4 py-2">{row[col]}</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>
