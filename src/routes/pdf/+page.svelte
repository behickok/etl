<script>
	import { onMount } from 'svelte';
	import Auth from './Auth.svelte';
	import Sidebar from './Sidebar.svelte';
	import Dashboard from './Dashboard.svelte';
	import Extraction from './Extraction.svelte';
	import SchemasManager from './SchemasManager.svelte';
	
	// Global authentication state
	export let loggedIn = false;
	export let user = null;
	
	// Navigation state
	let activeScreen = 'dashboard';
	
	// Listen for login events (could be via events or a shared store)
	function handleLogin(event) {
		user = event.detail.user;
		loggedIn = true;
	}

	function handleLogout() {
		user = null;
		loggedIn = false;
	}
</script>

{#if !loggedIn}
	<Auth on:login={handleLogin} />
{:else}
	<div class="flex h-screen">
		<Sidebar bind:activeScreen on:logout={handleLogout} />
		<main class="flex-1 p-6 overflow-y-auto">
			{#if activeScreen === 'dashboard'}
				<Dashboard {user} />
			{:else if activeScreen === 'extraction'}
				<Extraction />
			{:else if activeScreen === 'schemas'}
				<SchemasManager />
			{/if}
		</main>
	</div>
{/if}
