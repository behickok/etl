<script>
	import { createEventDispatcher } from 'svelte';
	const dispatch = createEventDispatcher();
	
	export let newSchema = {
		schemaName: '',
		tableName: '',
		columns: [{ name: '', type: 'VARCHAR' }],
		comments: '',
		validations: ''
	};
	export let editingSchemaIndex = -1;
	
	function addColumn() {
		newSchema.columns = [...newSchema.columns, { name: '', type: 'VARCHAR' }];
	}
	
	function save() {
		dispatch('save', { schema: { ...newSchema } });
	}
	
	function cancel() {
		dispatch('cancel');
	}
</script>

<div class="modal modal-open">
	<div class="modal-box">
		<h3 class="text-lg font-bold">
			{editingSchemaIndex !== -1 ? 'Edit Schema' : 'New Schema'}
		</h3>
		<div class="form-control mt-4">
			<label class="label">
				<span class="label-text">Schema Name</span>
			</label>
			<input type="text" bind:value={newSchema.schemaName} class="input input-bordered" placeholder="Enter schema name" />
		</div>
		<div class="form-control mt-4">
			<label class="label">
				<span class="label-text">Table Name</span>
			</label>
			<input type="text" bind:value={newSchema.tableName} class="input input-bordered" placeholder="Enter table name" />
		</div>
		<div class="mt-4">
			<label class="label">Columns</label>
			{#each newSchema.columns as col, i}
				<div class="mb-2 flex items-center gap-2">
					<input type="text" bind:value={col.name} placeholder="Column Name" class="input input-bordered flex-1" />
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
			<textarea bind:value={newSchema.comments} class="textarea textarea-bordered" placeholder="Enter any comments..."></textarea>
		</div>
		<div class="form-control mt-4">
			<label class="label">
				<span class="label-text">Validation Exceptions</span>
			</label>
			<textarea bind:value={newSchema.validations} class="textarea textarea-bordered" placeholder="Enter validations or exceptions to watch for..."></textarea>
		</div>
		<div class="modal-action">
			<button class="btn btn-secondary" on:click={cancel}>Cancel</button>
			<button class="btn btn-primary" on:click={save}>Save</button>
		</div>
	</div>
</div>
