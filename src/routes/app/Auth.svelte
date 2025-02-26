<script>
	import { onMount } from 'svelte';
	import { PUBLIC_USERBASE_APP } from '$env/static/public';
	import { authStore } from '$lib/store.js';

	// Which form is active: 'signIn' or 'signUp'
	let activeForm = 'signIn';
	let authError = '';
	let authUsername = '';
	let authPassword = '';
	let authEmail = '';
	let authCompany = ''; // New field for company

	onMount(() => {
		if (typeof userbase === 'undefined') {
			console.error('Userbase SDK not loaded');
			return;
		}
		userbase
			.init({ appId: PUBLIC_USERBASE_APP })
			.then((session) => {
				if (session.user) {
					authStore.set({ user: session.user, loggedIn: true });
				}
			})
			.catch((err) => console.error('Userbase init error:', err));
	});

	async function signUp() {
		try {
			const session = await userbase.signUp({
				username: authUsername,
				password: authPassword,
				email: authEmail,
				rememberMe: 'local',
				// Pass the company field as part of the profile object
				profile: { company: authCompany }
			});
			authStore.set({ user: session, loggedIn: true });
		} catch (error) {
			authError = error.message;
		}
	}

	async function signIn() {
		try {
			const session = await userbase.signIn({
				username: authUsername,
				password: authPassword,
				rememberMe: 'local'
			});
			authStore.set({ user: session, loggedIn: true });
			console.log(session);
		} catch (error) {
			authError = error.message;
		}
	}

	function signOut() {
		userbase.signOut();
		authStore.set({ user: null, loggedIn: false });
	}
</script>

<div class="min-h-screen flex items-center justify-center bg-base-200">
	<div class="w-full max-w-md p-8 bg-base-100 rounded-lg shadow-xl">
		<!-- <div class="tabs mb-6">
			<a
				class="tab tab-bordered {activeForm === 'signIn' ? 'tab-active' : ''}"
				on:click={() => { activeForm = 'signIn'; authError = ''; }}
			>
				Sign In
			</a>
			<a
				class="tab tab-bordered {activeForm === 'signUp' ? 'tab-active' : ''}"
				on:click={() => { activeForm = 'signUp'; authError = ''; }}
			>
				Sign Up
			</a>
		</div> -->

		{#if authError}
			<div class="alert alert-error mb-4">
				<span>{authError}</span>
			</div>
		{/if}

		{#if activeForm === 'signIn'}
			<form class="space-y-4" on:submit|preventDefault={signIn}>
				<div>
					<label class="label">Username</label>
					<input type="text" bind:value={authUsername} class="input input-bordered w-full" required />
				</div>
				<div>
					<label class="label">Password</label>
					<input type="password" bind:value={authPassword} class="input input-bordered w-full" required />
				</div>
				<div class="flex justify-between">
					<button type="submit" class="btn btn-primary">Sign In</button>
					<button type="button" class="btn btn-outline" on:click={signOut}>Sign Out</button>
				</div>
			</form>
		{:else}
			<!-- Sign Up Form -->
			<form class="space-y-4" on:submit|preventDefault={signUp}>
				<div>
					<label class="label">Username</label>
					<input type="text" bind:value={authUsername} class="input input-bordered w-full" required />
				</div>
				<div>
					<label class="label">Password</label>
					<input type="password" bind:value={authPassword} class="input input-bordered w-full" required />
				</div>
				<div>
					<label class="label">Email</label>
					<input type="email" bind:value={authEmail} class="input input-bordered w-full" required />
				</div>
				<div>
					<label class="label">Company</label>
					<input type="text" bind:value={authCompany} class="input input-bordered w-full" required />
				</div>
				<div class="flex justify-between">
					<button type="submit" class="btn btn-primary">Sign Up</button>
					<button type="button" class="btn btn-outline" on:click={signOut}>Sign Out</button>
				</div>
			</form>
		{/if}

		<!-- Toggle Button -->
		<div class="text-center mt-4">
			{#if activeForm === 'signIn'}
				<button class="btn btn-link" on:click={() => { activeForm = 'signUp'; authError = ''; }}>
					Don't have an account? Sign Up
				</button>
			{:else}
				<button class="btn btn-link" on:click={() => { activeForm = 'signIn'; authError = ''; }}>
					Already have an account? Sign In
				</button>
			{/if}
		</div>

	</div>
</div>
