<script>
    	import { authStore } from '$lib/store.js';
	export let activeScreen;
	
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
		<li>
			<button class="btn btn-ghost" on:click={() => selectScreen('dashboard')}>
				Dashboard
			</button>
		</li>
		<li>
			<button class="btn btn-ghost" on:click={() => selectScreen('extraction')}>
				File Extraction
			</button>
		</li>
		<li>
			<button class="btn btn-ghost" on:click={() => selectScreen('schemas')}>
				Schemas
			</button>
		</li>
	</ul>
	<div class="mt-8">
		<button class="btn btn-outline w-full" on:click={logout}>
			Sign Out
		</button>
	</div>
</nav>
