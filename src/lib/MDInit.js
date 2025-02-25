"use client"
import { PUBLIC_MD_TOKEN } from'$env/static/public'

let token=PUBLIC_MD_TOKEN
// Create a connection to MotherDuck to be used in the frontend throughout a session.
export default async function initMotherDuckConnection(database) {
    if (typeof Worker === "undefined") {
        console.error("Web Workers are not supported in this environment.")
        return;
    }

    try {
        // Dynamically import MDConnection
        const motherduckWasmModule = await import("@motherduck/wasm-client").then(
            (mod) => mod
        );

        if (!motherduckWasmModule.MDConnection) {
            console.error("Failed to load MDConnection");
            return;
        }

        const _connection = motherduckWasmModule.MDConnection.create({ mdToken: token });

        if (database) {
            await _connection.evaluateQuery(`USE ${database}`);
        }

        return _connection;
    } catch (error) {
        console.error("Failed to create DuckDB connection", error);
    }
}