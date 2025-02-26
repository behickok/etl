<script>
	import { onMount } from 'svelte';
	import { authStore } from '$lib/store.js';
	import Auth from './Auth.svelte';
	import Sidebar from './Sidebar.svelte';
	import Dashboard from './Dashboard.svelte';
	import Extraction from './Extraction.svelte';
	import SchemasManager from './SchemasManager.svelte';
	import Query from './Query.svelte';
	import Files from './Files.svelte';
	// import other screens as needed

	// Global authentication state
	let loggedIn = false;
	let user = null;
	
	// Navigation state
	let activeScreen = 'dashboard';
	
	// Mapping screen names to components
	const screens = {
		dashboard: Dashboard,
		files: Files,
		extraction: Extraction,
		query:Query,
		schemas: SchemasManager
		// Add additional screens here as needed
	};

	// Update authentication state using reactive statements
	$: {
		user = $authStore?.user;
		loggedIn = $authStore?.loggedIn;
	}
</script>

{#if !loggedIn}
	<Auth />
{:else if user}
	<div class="flex h-screen">
		<Sidebar bind:activeScreen />
		<main class="flex-1 p-6 overflow-y-auto">
			<!-- Dynamically render the active screen -->
			<svelte:component this={screens[activeScreen]} {user} />
		</main>
	</div>
{/if}
