<script>
	import { onMount } from 'svelte';
	import { authStore } from '$lib/store.js';
	import Auth from './Auth.svelte';
	import Sidebar from './Sidebar.svelte';
	import Extraction from './Extraction.svelte';
	import SchemasManager from './SchemasManager.svelte';
	import Query from './Query.svelte';
	import Files from './Files.svelte';
	import Mapping from './Mapping.svelte';
	import Table from './Table.svelte';
	import Admin from './Admin.svelte';
	import NoClient from './NoClient.svelte';
	// Import additional screens as needed

	// Global authentication state
	let loggedIn = false;
	let user = null;
	
	// Navigation state: activeScreen and activeItem
	let activeScreen = 'files';
	let activeItem = null;
	
	// Mapping screen names to components.
	// Note: If your Sidebar sets activeScreen to dynamic names like "sources" or "domains",
	// make sure to handle them here.
	const screens = {
		files: Files,
		extraction: Extraction,
		query: Query,
		mapping: Mapping,
		sources: Table,
		domains: Table,
		admin: Admin
	};

	// Update authentication state using reactive statements.
	$: {
		user = $authStore?.user;
		loggedIn = $authStore?.loggedIn;
	}
</script>
<!-- {JSON.stringify($authStore)}
<Auth /> -->

{#if !loggedIn}
	<Auth />
{:else if user}
	{#if !user.protectedProfile || !user.protectedProfile.client}
		<NoClient />
	{:else}
		<div class="flex h-screen">
			<Sidebar bind:activeScreen bind:activeItem />
			<main class="flex-1 p-6 overflow-y-auto">
				<!-- Pass activeItem if your screen needs the parameter -->
				<svelte:component this={screens[activeScreen]} {user} {activeItem} />
			</main>
		</div>
	{/if}
{/if}
