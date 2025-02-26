import { writable } from 'svelte/store';

export const authStore = writable({
	loggedIn: false,
	user: null
});

export const mappingStore = writable([]);
