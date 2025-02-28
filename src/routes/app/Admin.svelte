<script>
	import { onMount } from 'svelte';
	import { authStore, mappingStore } from '$lib/store';
	import NewSchemaModal from './NewSchemaModal.svelte';
	import { PUBLIC_USERBASE_APP } from '$env/static/public';
	import initMotherDuckConnection from '$lib/MDInit.js';

	// ----------------- TAB MANAGEMENT -----------------
	let activeTab = 'users'; // "users" for user management, "env" for environment variables

	// ----------------- USER MANAGEMENT STATE -----------------
	let users = [];
	let usersError = '';
	let selectedUser = null; // currently selected user for editing
	let editEmail = '';
	let editDisplayName = '';
	let editClient = '';
	// New variable for role
	let editRole = 'Reader'; // default to Reader if not set

	// Feedback for user updates
	let message = '';
	let errorProfile = '';
	let errorProtected = '';

	// Load available users from the secure API endpoint
	async function loadUsers() {
		usersError = '';
		try {
			const res = await fetch('/api/listUsers');
			const data = await res.json();
			if (res.ok) {
				users = data.users;
			} else {
				usersError = data.error || 'Failed to load users.';
			}
		} catch (err) {
			usersError = err.message;
		}
	}

	// When a user is selected, pre-populate the edit form fields.
	function selectUser(user) {
		selectedUser = user;
		editEmail = user.email || '';
		editDisplayName = user.profile?.displayName || '';
		editClient = user.protectedProfile?.client || '';
		// Set the role if it exists; otherwise, default to Reader.
		editRole = user.protectedProfile?.role || 'Reader';
		message = '';
		errorProfile = '';
		errorProtected = '';
	}

	// Update the public profile via the client-side SDK.
	async function handleUpdateProfile() {
		errorProfile = '';
		message = '';
		try {
			await userbase.updateUser({
				username: selectedUser.username,
				email: editEmail,
				profile: { displayName: editDisplayName }
			});
			message = `Profile updated successfully for ${selectedUser.username}.`;
			await loadUsers();
		} catch (e) {
			errorProfile = e.message || e;
		}
	}

	// Update the protected profile via the secure API endpoint.
	async function handleUpdateProtectedProfile() {
		errorProtected = '';
		message = '';
		try {
			const res = await fetch('/api/updateProtectedProfile', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					username:selectedUser.userId,
					client: editClient,
					role: editRole
				})
			});
			const data = await res.json();
			if (!res.ok) {
				throw new Error(data.error || 'Failed to update protected profile');
			}
			message = `Protected profile updated successfully for ${selectedUser.username}.`;
			await loadUsers();
		} catch (err) {
			errorProtected = err.message || err;
		}
	}

	// ----------------- ENVIRONMENT VARIABLES STATE -----------------
	let envVars = [];
	let envError = '';
	let editingVar = null;   // currently editing variable
	let newVarName = '';
	let newVarValue = '';
	let isEditingNew = false;

	async function loadEnvVars() {
		envError = '';
		try {
			const connection = await initMotherDuckConnection($authStore.user.protectedProfile.client);
			if (!connection) throw new Error("Could not establish connection");
			const queryResult = await connection.safeEvaluateQuery('SELECT * FROM environment_variables;');
			if (queryResult?.result) {
				envVars = queryResult.result.data.toRows();
			}
		} catch (e) {
			envError = e.message;
		}
	}

	async function saveEnvVar() {
		envError = '';
		message = '';
		try {
			const connection = await initMotherDuckConnection($authStore.user.protectedProfile.client);
			if (!connection) throw new Error("Could not establish connection");

			if (isEditingNew) {
				// Insert new variable
				const insertQuery = `
					INSERT INTO environment_variables (name, value)
					VALUES ('${newVarName}', '${newVarValue}');
				`;
				await connection.safeEvaluateQuery(insertQuery);
				message = `Variable "${newVarName}" created successfully.`;
			} else {
				// Update existing variable
				const updateQuery = `
					UPDATE environment_variables
					SET value = '${editingVar.value}'
					WHERE name = '${editingVar.name}';
				`;
				await connection.safeEvaluateQuery(updateQuery);
				message = `Variable "${editingVar.name}" updated successfully.`;
			}

			await loadEnvVars();
			cancelEdit();
		} catch (err) {
			envError = err.message;
		}
	}

	async function deleteEnvVar(variable) {
		envError = '';
		message = '';
		try {
			const connection = await initMotherDuckConnection($authStore.user.protectedProfile.client);
			if (!connection) throw new Error("Could not establish connection");
			const deleteQuery = `
				DELETE FROM environment_variables
				WHERE name = '${variable.name}';
			`;
			await connection.safeEvaluateQuery(deleteQuery);
			message = `Variable "${variable.name}" deleted successfully.`;
			await loadEnvVars();
		} catch (err) {
			envError = err.message;
		}
	}

	function editEnvVar(variable) {
		isEditingNew = false;
		editingVar = { ...variable };
	}
	function addNewEnvVar() {
		isEditingNew = true;
		newVarName = '';
		newVarValue = '';
		editingVar = null;
	}
	function cancelEdit() {
		isEditingNew = false;
		editingVar = null;
		newVarName = '';
		newVarValue = '';
	}

	// ----------------- INITIALIZATION -----------------
	onMount(() => {
		loadUsers();
		loadEnvVars();
	});
</script>

<div class="admin-page">
	<h1 class="text-3xl font-bold text-center mb-6">Admin Panel</h1>

	{#if message}
		<div class="alert alert-success mb-4">{message}</div>
	{/if}

	<!-- Tabs -->
	<div class="tabs mb-4">
		<button class="tab tab-lifted" class:tab-active={activeTab==='users'} on:click={() => (activeTab = 'users')}>
			User Management
		</button>
		<button class="tab tab-lifted" class:tab-active={activeTab==='env'} on:click={() => (activeTab = 'env')}>
			Environment Variables
		</button>
	</div>

	<!-- USER MANAGEMENT TAB -->
	{#if activeTab === 'users'}
		<div class="grid grid-cols-1 md:grid-cols-2 gap-8">
			<!-- List of Available Users -->
			<div class="admin-form">
				<h2 class="text-xl font-semibold mb-2">Available Users</h2>
				{#if usersError}
					<div class="alert alert-error mb-2">{usersError}</div>
				{/if}
				{#if users && users.length > 0}
					<div class="overflow-x-auto">
						<table class="table w-full">
							<thead>
								<tr>
									<th>User ID</th>
									<th>Username</th>
									<th>Email</th>
									<th>Display Name</th>
									<th>Actions</th>
								</tr>
							</thead>
							<tbody>
								{#each users as usr}
									<tr>
										<td>{usr.userId}</td>
										<td>{usr.username}</td>
										<td>{usr.email}</td>
										<td>{usr.profile?.displayName}</td>
										<td>
											<button class="btn btn-sm btn-primary" on:click={() => selectUser(usr)}>
												Edit
											</button>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{:else}
					<p>No users found.</p>
				{/if}
			</div>

			<!-- Edit User Form (displayed when a user is selected) -->
			{#if selectedUser}
				<div class="admin-form">
					<h2 class="text-xl font-bold mb-4">Edit User: {selectedUser.username}</h2>
					<div class="form-control mb-4">
						<label class="label">Email</label>
						<input class="input input-bordered w-full" type="email" bind:value={editEmail} />
					</div>
					<div class="form-control mb-4">
						<label class="label">Display Name</label>
						<input class="input input-bordered w-full" type="text" bind:value={editDisplayName} />
					</div>
					<div class="form-control mb-4">
						<label class="label">Protected Profile Client</label>
						<input class="input input-bordered w-full" type="text" bind:value={editClient} />
					</div>
					<div class="form-control mb-4">
						<label class="label">Role</label>
						<select class="select select-bordered w-full" bind:value={editRole}>
							<option value="Admin">Admin</option>
							<option value="Reader">Reader</option>
							<option value="Writer">Writer</option>
						</select>
					</div>
					{#if errorProfile}
						<div class="alert alert-error mb-2">{errorProfile}</div>
					{/if}
					{#if errorProtected}
						<div class="alert alert-error mb-2">{errorProtected}</div>
					{/if}
					<div class="flex gap-4">
						<button class="btn btn-primary" on:click={handleUpdateProfile}>
							Update Profile
						</button>
						<button class="btn btn-secondary" on:click={handleUpdateProtectedProfile}>
							Update Protected Profile
						</button>
						<button class="btn btn-ghost" on:click={() => (selectedUser = null)}>
							Cancel
						</button>
					</div>
				</div>
			{/if}
		</div>
	

	<!-- ENVIRONMENT VARIABLES TAB -->
	{:else if activeTab === 'env'}
		{#if envError}
			<div class="alert alert-error mb-4">{envError}</div>
		{/if}
		<div class="overflow-x-auto mb-4">
			<table class="table w-full">
				<thead>
					<tr>
						<th>Name</th>
						<th>Value</th>
						<th>Actions</th>
					</tr>
				</thead>
				<tbody>
					{#each envVars as variable}
						<tr>
							<td>{variable.name}</td>
							<td>
								{#if editingVar && editingVar.name === variable.name}
									<input class="input input-bordered w-full" type="text" bind:value={editingVar.value} />
								{:else}
									{variable.value}
								{/if}
							</td>
							<td class="whitespace-nowrap">
								{#if editingVar && editingVar.name === variable.name}
									<button class="btn btn-primary btn-sm mr-2" on:click={saveEnvVar}>
										Save
									</button>
									<button class="btn btn-ghost btn-sm" on:click={cancelEdit}>
										Cancel
									</button>
								{:else}
									<button class="btn btn-sm btn-primary mr-2" on:click={() => editEnvVar(variable)}>
										Edit
									</button>
									<button class="btn btn-sm btn-error" on:click={() => deleteEnvVar(variable)}>
										Delete
									</button>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		{#if isEditingNew}
			<div class="admin-form">
				<h3 class="text-lg font-bold mb-2">Add New Variable</h3>
				<div class="form-control mb-2">
					<label class="label">Name</label>
					<input class="input input-bordered w-full" type="text" bind:value={newVarName} />
				</div>
				<div class="form-control mb-4">
					<label class="label">Value</label>
					<input class="input input-bordered w-full" type="text" bind:value={newVarValue} />
				</div>
				<button class="btn btn-primary mr-2" on:click={saveEnvVar}>Save</button>
				<button class="btn btn-ghost" on:click={cancelEdit}>Cancel</button>
			</div>
		{:else}
			<button class="btn btn-secondary" on:click={addNewEnvVar}>Add New Variable</button>
		{/if}
	{/if}
</div>
