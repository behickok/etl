<script>
	import { onMount } from 'svelte';
	import { authStore } from '$lib/store.js';
	import Auth from './Auth.svelte';
	import Sidebar from './Sidebar.svelte';
	import Dashboard from './Dashboard.svelte';
	import Extraction from './Extraction.svelte';
	import SchemasManager from './SchemasManager.svelte';
	
	// Global authentication state
	let loggedIn=false
	let user=null
	
	// Navigation state
	let activeScreen = 'dashboard';
	
$:{
		user = $authStore?.user
		loggedIn = $authStore?.loggedIn
}

</script>

{#if !loggedIn}
	<Auth />
{:else if user}
	<div class="flex h-screen">
		<Sidebar bind:activeScreen />
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
