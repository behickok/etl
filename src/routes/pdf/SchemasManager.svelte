<script>
	import { createEventDispatcher, onMount } from 'svelte';
	const dispatch = createEventDispatcher();

	// Schemas could be passed in as a prop or managed via a store.
	let schemas = [];
	let selectedSchemaIndex = -1;

	onMount(() => {
		const stored = localStorage.getItem('schemas');
		if (stored) {
			schemas = JSON.parse(stored);
		}
	});

	function saveSchemas() {
		localStorage.setItem('schemas', JSON.stringify(schemas));
	}

	function editSchema(index) {
		selectedSchemaIndex = index;
		// Emit an event so a parent component can switch to the extraction screen
		// with the selected schema ready for editing.
		dispatch('edit', { index, schema: schemas[index] });
	}

	function deleteSchema(index) {
		schemas.splice(index, 1);
		schemas = schemas.slice();
		saveSchemas();
	}

</script>

<div>
	<h2 class="text-2xl font-bold mb-4">Manage Schemas</h2>
	{#if schemas.length === 0}
		<p>No schemas found. Create one using the "New Schema" button in the File Extraction screen.</p>
	{:else}
		<ul class="space-y-2">
			{#each schemas as schema, index}
				<li class="p-2 border rounded flex justify-between items-center">
					<div>
						<strong>{schema.schemaName}</strong> - {schema.tableName}
					</div>
					<div class="space-x-2">
						<button 
							class="btn btn-sm btn-warning" 
							on:click={() => editSchema(index)}>
							Edit
						</button>
						<button 
							class="btn btn-sm btn-error" 
							on:click={() => deleteSchema(index)}>
							Delete
						</button>
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</div>
