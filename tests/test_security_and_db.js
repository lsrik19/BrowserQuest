const http = require('http');
const { spawn } = require('child_process');
const WebSocketClient = require('websocket').client;
const Database = require('../server/js/db');
const config = require('../server/config.json');

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTests() {
    console.log("=== BROWSERQUEST SECURITY & SUPABASE INTEGRATION TEST SUITE ===");
    let passed = 0;
    let failed = 0;

    function assert(desc, condition) {
        if (condition) {
            console.log("  [PASS] " + desc);
            passed++;
        } else {
            console.error("  [FAIL] " + desc);
            failed++;
        }
    }

    // 1. Supabase Database Module Tests (AWS env vars or in-memory fallback)
    console.log("\n1. Testing Database Module (server/js/db.js):");
    const db = new Database(config);
    const hasCloudCredentials = db.enabled;
    console.log("  Database mode: " + (hasCloudCredentials ? "Supabase Cloud (" + process.env.SUPABASE_URL + ")" : "In-Memory / Local fallback"));

    const testUser = "CloudWarrior";
    await new Promise(resolve => {
        db.getOrCreatePlayer(testUser, 21, 60, (err, player) => {
            assert("getOrCreatePlayer succeeds without error", !err);
            assert("Retrieved player username 'CloudWarrior'", player && player.username === "CloudWarrior");
            if (hasCloudCredentials) {
                assert("Retrieved cloud armor (Golden Armor: 26)", player && player.armor === 26);
                assert("Retrieved cloud weapon (Golden Sword: 63)", player && player.weapon === 63);
            } else {
                assert("Player has valid starting armor", player && typeof player.armor === 'number');
                assert("Player has valid starting weapon", player && typeof player.weapon === 'number');
            }
            resolve();
        });
    });

    // 2. Start Game Server Subprocess
    console.log("\n2. Starting Game Server (server/js/main.js):");
    const serverProcess = spawn('node', ['server/js/main.js'], {
        cwd: process.cwd(),
        env: process.env,
        stdio: ['pipe', 'pipe', 'pipe']
    });

    serverProcess.stdout.on('data', data => {
        console.log("  [SERVER STDOUT]", data.toString().trim());
    });

    serverProcess.stderr.on('data', data => {
        const msg = data.toString();
        if (!msg.includes("Could not open config file: ./server/config_local.json")) {
            console.error("  [SERVER STDERR]", msg.trim());
        }
    });

    // Wait 2.5s for server initialization
    await sleep(2500);

    try {
        // 3. HTTP /status Endpoint Test
        console.log("\n3. Testing HTTP /status endpoint:");
        const statusRes = await new Promise((resolve, reject) => {
            http.get('http://localhost:8000/status', res => {
                let body = '';
                res.on('data', chunk => body += chunk);
                res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body }));
            }).on('error', reject);
        });

        assert("Status endpoint returns HTTP 200", statusRes.statusCode === 200);
        assert("Status endpoint has Content-Type application/json", statusRes.headers['content-type'].includes('application/json'));
        const worldCounts = JSON.parse(statusRes.body);
        assert("World population returns an array of worlds", Array.isArray(worldCounts) && worldCounts.length === 5);

        // 4. WebSocket Game Client & Cloud Equipment Sync Test
        console.log("\n4. Testing WebSocket Handshake & Supabase Cloud Save Sync:");
        await new Promise((resolve, reject) => {
            const client = new WebSocketClient();
            let welcomeReceived = false;
            let armorSynced = false;
            let weaponSynced = false;

            client.on('connectFailed', err => {
                console.error("  [WS CONNECT FAILED]", err);
                reject(err);
            });

            client.on('connect', connection => {
                console.log("  [WS CONNECTED]");
                connection.on('message', message => {
                    console.log("  [WS RAW MESSAGE RECEIVED]", message.utf8Data);
                    if (message.type === 'utf8') {
                        try {
                            const packet = JSON.parse(message.utf8Data);
                            console.log("  [WS PARSED PACKET]", packet);
                            // Packet format: [opcode, ...data] or batch [[opcode, ...], [opcode, ...]]
                            const packets = (Array.isArray(packet) && Array.isArray(packet[0])) ? packet : [packet];
                            packets.forEach(p => {
                                // Types.Messages.WELCOME is 1
                                if (p[0] === 1) {
                                    welcomeReceived = true;
                                    assert("Server responds with WELCOME packet", true);
                                    assert("Welcome packet contains player name 'CloudWarrior'", p[2] === "CloudWarrior");
                                }
                                // Types.Messages.EQUIP is 13: [13, playerId, itemKind]
                                if (p[0] === 13) {
                                    const itemKind = p[2];
                                    if (itemKind === 26) {
                                        armorSynced = true;
                                        assert("Server pushed EQUIP packet overriding starter armor with Golden Armor (26)", true);
                                    }
                                    if (itemKind === 63) {
                                        weaponSynced = true;
                                        assert("Server pushed EQUIP packet overriding starter weapon with Golden Sword (63)", true);
                                    }
                                }
                            });
                        } catch (e) {}
                    }
                });

                // Client sends HELLO with starter gear (21, 60)
                // HELLO is opcode 0: [0, name, armor, weapon]
                connection.sendUTF(JSON.stringify([0, "CloudWarrior", 21, 60]));

                setTimeout(() => {
                    connection.close();
                    assert("Welcome packet received successfully", welcomeReceived);
                    if (hasCloudCredentials) {
                        assert("Cloud gear (armor 26) successfully pushed to client", armorSynced);
                        assert("Cloud gear (weapon 63) successfully pushed to client", weaponSynced);
                    }
                    resolve();
                }, 4000);
            });

            client.connect('ws://localhost:8000/', null);
        });

        // 5. Security & Robustness Fuzzing Tests
        console.log("\n5. Testing Security Defenses & Fuzzing Resilience:");
        await new Promise((resolve, reject) => {
            const client = new WebSocketClient();

            client.on('connectFailed', reject);

            client.on('connect', connection => {
                // A) Send completely malformed non-JSON string
                connection.sendUTF("MALFORMED{{{NOT_JSON");

                // B) Send prototype pollution attempt
                connection.sendUTF(JSON.stringify(["__proto__", { "polluted": true }]));

                // C) Send oversized string
                connection.sendUTF(JSON.stringify([0, "A".repeat(1000), 21, 60]));

                // D) Send float / non-integer coordinates in MOVE packet
                connection.sendUTF(JSON.stringify([2, 14.555, "NaN"]));

                // E) Send non-array payload
                connection.sendUTF(JSON.stringify({ evil: true }));

                setTimeout(() => {
                    connection.close();
                    resolve();
                }, 1000);
            });

            client.connect('ws://localhost:8000/', null);
        });

        // Verify server is STILL alive and responding after all malicious payloads
        const healthCheck = await new Promise((resolve, reject) => {
            http.get('http://localhost:8000/status', res => {
                let body = '';
                res.on('data', chunk => body += chunk);
                res.on('end', () => resolve({ statusCode: res.statusCode, body }));
            }).on('error', reject);
        });

        assert("Game server survived all fuzzing/security attack payloads without crashing", healthCheck.statusCode === 200);

    } finally {
        serverProcess.kill('SIGTERM');
        await sleep(500);
    }

    console.log("\n=======================================================");
    console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
    console.log("=======================================================\n");

    if (failed > 0) {
        process.exit(1);
    }
}

runTests().catch(err => {
    console.error("Test runner encountered error:", err);
    process.exit(1);
});
