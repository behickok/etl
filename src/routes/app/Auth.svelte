<script>
	import { PUBLIC_USERBASE_APP } from '$env/static/public';
	import { authStore } from '$lib/store.js';

	let authError = '';
	let authUsername = '';
	let authPassword = '';
	let authEmail = '';

	// onMount to initialize Userbase SDK
	import { onMount } from 'svelte';
	onMount(() => {
		if (typeof userbase === 'undefined') {
			console.error('Userbase SDK not loaded');
			return;
		}
		userbase
			.init({ appId: PUBLIC_USERBASE_APP })
			.then((session) => {
				if (session.user) {
					$authStore.user = session.user;
					$authStore.loggedIn = true;
					$authStore = $authStore;
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
				rememberMe: 'local'
			});
			$authStore.user = session;
			$authStore.loggedIn = true;
			$authStore = $authStore;
		} catch (error) {
			authError = error.message;
		}
	}

	function signOut() {
		userbase.signOut();
		$authStore.user = null;
		$authStore.loggedIn = false;
		$authStore = $authStore;
	}
	async function signIn() {
		try {
			const session = await userbase.signIn({
				username: authUsername,
				password: authPassword,
				rememberMe: 'local'
			});
			$authStore.user = session;
			$authStore.loggedIn = true;
			$authStore = $authStore;
            console.log(session)
		} catch (error) {
			authError = error.message;
		}
	}
</script>

<div class="auth-container p-4">
	<h2 class="mb-4 text-xl font-bold">Please Sign In or Sign Up</h2>
	{#if authError}
		<div class="error mb-2 text-red-500">{authError}</div>
	{/if}
	<div class="mb-2">
		<label class="block">Username:</label>
		<input type="text" bind:value={authUsername} class="input input-bordered w-full" />
	</div>
	<div class="mb-2">
		<label class="block">Password:</label>
		<input type="password" bind:value={authPassword} class="input input-bordered w-full" />
	</div>
	<div class="mb-2">
		<label class="block">Email (for sign up):</label>
		<input type="email" bind:value={authEmail} class="input input-bordered w-full" />
	</div>
	<div class="flex gap-2">
		<button class="btn btn-primary" on:click={signIn}>Sign In</button>
		<button class="btn btn-secondary" on:click={signUp}>Sign Up</button>
		<button class="btn btn-accent" on:click={signOut}>Sign Out</button>
	</div>
	<div class="mt-2">
		<!-- Debug info -->
		User: {authUsername}<br />
	</div>
</div>
