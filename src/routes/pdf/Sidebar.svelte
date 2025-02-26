<script>
	import { onMount } from 'svelte';
	import { get } from 'svelte/store';
	import initMotherDuckConnection from '$lib/MDInit.js';
	import { authStore, mappingStore } from '$lib/store.js';

	export let activeScreen;
	export let activeItem;

	// Define main menu items
	const menuItems = [
		{ label: 'Files', screen: 'files' },
		{ label: 'Query', screen: 'query' },
		{ label: 'Mapping', screen: 'mapping' }
	];

	let mappingEntries = [];
	let domains = [];
	let mappingError = '';

	async function loadMapping() {
		try {
			const connection = await initMotherDuckConnection("stratum");
			if (connection) {
				const query = 'SELECT * FROM mapping;';
				const queryResult = await connection.safeEvaluateQuery(query);
				if (queryResult && queryResult.result) {
					mappingStore.set(queryResult.result.data.toRows());
				}
			}
		} catch (e) {
			mappingError = e.message;
			console.error('Error loading mapping:', e);
		}
	}

	function computeDistinct(mappingData) {
		const entriesSet = new Set();
		const distinctEntries = [];
		const domainsSet = new Set();

		mappingData.forEach(row => {
			const key = `${row.source}_${row.domain}_${row.source_index}`;
			if (!entriesSet.has(key)) {
				entriesSet.add(key);
				distinctEntries.push(key);
			}
			domainsSet.add(row.domain);
		});
		return {
			entries: distinctEntries,
			domains: Array.from(domainsSet)
		};
	}

	onMount(() => {
		loadMapping();
	});

	// Re-compute distinct entries & domains whenever mappingStore changes
	$: {
		if ($mappingStore && $mappingStore.length > 0) {
			const distinct = computeDistinct($mappingStore);
			mappingEntries = distinct.entries;
			domains = distinct.domains;
		}
	}

	function selectScreen(item) {
		activeScreen = item.screen;
		activeItem = item;
	}

	function logout() {
		authStore.set({ loggedIn: false, user: null });
		userbase.signOut();
	}
</script>

<!-- Sidebar container -->
<nav class="flex flex-col h-screen w-64 bg-base-200">
	<!-- Top section (Menu) -->
	<div class="py-4 px-4 overflow-y-auto flex-1">
		<h3 class="text-xl font-bold mb-4">Menu</h3>

		<!-- Main menu (daisyUI menu) -->
		<ul class="menu menu-compact p-0">
			{#each menuItems as item}
				<li>
					<button
						class="justify-start"
						on:click={() => selectScreen(item)}
					>
						{item.label}
					</button>
				</li>
			{/each}

			<!-- Sources Section -->
			<li class="menu-title mt-4">
				<span>Sources</span>
			</li>
			{#if mappingEntries.length}
				{#each mappingEntries as entry}
					<li>
						<button
							class="justify-start"
							on:click={() =>
								selectScreen({ label: 'Sources', screen: 'sources', parameter: entry })
							}
						>
							{entry}
						</button>
					</li>
				{/each}
			{:else}
				<li class="pl-4 text-sm text-gray-500">No entries found</li>
			{/if}

			<!-- Domains Section -->
			<li class="menu-title mt-4">
				<span>Domains</span>
			</li>
			{#if domains.length}
				{#each domains as domain}
					<li>
						<button
							class="justify-start"
							on:click={() =>
								selectScreen({ label: 'Domains', screen: 'domains', parameter: domain })
							}
						>
							{domain}
						</button>
					</li>
				{/each}
			{:else}
				<li class="pl-4 text-sm text-gray-500">No domains found</li>
			{/if}
		</ul>

		<!-- Display error if any -->
		{#if mappingError}
			<div class="alert alert-error mt-4">{mappingError}</div>
		{/if}
	</div>

	<!-- Bottom section (Sign Out) -->
	<div class="p-4">
		<button class="btn btn-outline w-full" on:click={logout}>
			Sign Out
		</button>
	</div>
</nav>
