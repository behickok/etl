<script>
    import {authStore} from '$lib/store'
	function logout() {
		$authStore={ loggedIn: false, user: null };
        $authStore=$authStore
		userbase.signOut();
	}
</script>

<div class="hero min-h-screen bg-base-200">
	<div class="hero-content text-center">
		<div class="max-w-md">
			<h1 class="text-5xl font-bold">Request Pending</h1>
			<p class="py-6">
				Your access request is pending approval. You will be notified once your request has been approved.
			</p>
            <button class="btn btn-link" onclick={logout}>Sign in with a different account</button>
		</div>
	</div>
</div>
