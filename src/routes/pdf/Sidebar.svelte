<script>
	import { authStore } from '$lib/store.js';
	export let activeScreen;
	
	// Define the menu items as an array of objects
	const menuItems = [
		{ label: 'Dashboard', screen: 'dashboard' },
		{ label: 'Files', screen: 'files' },
		{ label: 'Query', screen: 'query' },
		{ label: 'File Extraction', screen: 'extraction' },
		{ label: 'Schemas', screen: 'schemas' }
	];

	function selectScreen(screen) {
		activeScreen = screen;
	}

	function logout() {
		// Update the store directly
		authStore.set({ loggedIn: false, user: null });
		// Optionally call your SDK's signOut method here as well
		userbase.signOut();
	}
</script>

<nav class="w-64 bg-base-200 p-4">
	<h3 class="font-bold text-xl mb-4">Menu</h3>
	<ul class="space-y-2">
		{#each menuItems as item}
			<li>
				<button class="btn btn-ghost" on:click={() => selectScreen(item.screen)}>
					{item.label}
				</button>
			</li>
		{/each}
	</ul>
	<div class="mt-8">
		<button class="btn btn-outline w-full" on:click={logout}>
			Sign Out
		</button>
	</div>
</nav>
