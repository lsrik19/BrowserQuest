
var createClient = require('@supabase/supabase-js').createClient;

var Database = function(config) {
    this.enabled = false;
    this.client = null;
    
    var url = process.env.SUPABASE_URL || (config && config.supabase_url);
    var key = process.env.SUPABASE_SERVICE_ROLE_KEY || (config && config.supabase_service_role_key);
    var isEnabled;
    if (process.env.SUPABASE_ENABLED !== undefined) {
        isEnabled = (process.env.SUPABASE_ENABLED === 'true' || process.env.SUPABASE_ENABLED === '1');
    } else if (url && key) {
        isEnabled = (config && typeof config.supabase_enabled !== 'undefined')
            ? config.supabase_enabled
            : true;
    } else {
        isEnabled = false;
    }
    
    if(isEnabled && url && key) {
        try {
            this.client = createClient(url, key, {
                auth: { persistSession: false }
            });
            this.enabled = true;
            if(typeof log !== "undefined" && log.info) {
                log.info("Supabase database integration enabled (" + url + ")");
            }
        } catch(e) {
            if(typeof log !== "undefined" && log.error) {
                log.error("Failed to initialize Supabase client: " + e.message);
            }
        }
    } else {
        if(typeof log !== "undefined" && log.info) {
            log.info("Supabase database integration disabled (running in-memory mode)");
        }
    }
};

Database.prototype.getOrCreatePlayer = function(username, defaultArmor, defaultWeapon, callback) {
    if(!this.enabled || !this.client) {
        return callback(null, {
            username: username,
            armor: defaultArmor,
            weapon: defaultWeapon,
            isNew: false
        });
    }
    
    var self = this;
    this.client
        .from('players')
        .select('*')
        .ilike('username', username)
        .limit(1)
        .maybeSingle()
        .then(function(res) {
            if(res.error) {
                if(typeof log !== "undefined" && log.error) {
                    log.error("Supabase getPlayer error for " + username + ": " + res.error.message);
                }
                return callback(null, { username: username, armor: defaultArmor, weapon: defaultWeapon, isNew: false });
            }
            
            if(res.data) {
                // Update last_login timestamp
                self.client
                    .from('players')
                    .update({ last_login: new Date().toISOString() })
                    .eq('id', res.data.id)
                    .then(function() {});
                
                return callback(null, res.data);
            }
            
            // New player registration
            var newPlayer = {
                username: username,
                armor: defaultArmor || 21,
                weapon: defaultWeapon || 60,
                x: 14,
                y: 224,
                total_kills: 0,
                total_dmg: 0,
                total_revives: 0,
                achievements: []
            };
            
            self.client
                .from('players')
                .insert(newPlayer)
                .select('*')
                .single()
                .then(function(insertRes) {
                    if(insertRes.error) {
                        if(typeof log !== "undefined" && log.error) {
                            log.error("Supabase createPlayer error for " + username + ": " + insertRes.error.message);
                        }
                        return callback(null, newPlayer);
                    }
                    return callback(null, insertRes.data);
                });
        })
        .catch(function(err) {
            if(typeof log !== "undefined" && log.error) {
                log.error("Supabase exception for " + username + ": " + err.message);
            }
            return callback(null, { username: username, armor: defaultArmor, weapon: defaultWeapon, isNew: false });
        });
};

Database.prototype.savePlayer = function(player, callback) {
    if(!this.enabled || !this.client || !player || !player.name) {
        if(callback) callback();
        return;
    }
    
    var updates = {
        armor: player.armor,
        weapon: player.weapon,
        x: player.x,
        y: player.y,
        updated_at: new Date().toISOString()
    };
    
    this.client
        .from('players')
        .update(updates)
        .ilike('username', player.name)
        .then(function(res) {
            if(res.error && typeof log !== "undefined" && log.error) {
                log.error("Supabase savePlayer error for " + player.name + ": " + res.error.message);
            }
            if(callback) callback(res.error);
        })
        .catch(function(err) {
            if(typeof log !== "undefined" && log.error) {
                log.error("Supabase savePlayer exception: " + err.message);
            }
            if(callback) callback(err);
        });
};

Database.prototype.saveEquipment = function(username, armor, weapon) {
    if(!this.enabled || !this.client || !username) {
        return;
    }
    
    var updates = { updated_at: new Date().toISOString() };
    if(armor !== undefined) updates.armor = armor;
    if(weapon !== undefined) updates.weapon = weapon;
    
    this.client
        .from('players')
        .update(updates)
        .ilike('username', username)
        .then(function(res) {
            if(res.error && typeof log !== "undefined" && log.error) {
                log.error("Supabase saveEquipment error for " + username + ": " + res.error.message);
            }
        })
        .catch(function(err) {
            if(typeof log !== "undefined" && log.error) {
                log.error("Supabase saveEquipment exception: " + err.message);
            }
        });
};

Database.prototype.recordKill = function(username) {
    if(!this.enabled || !this.client || !username) {
        return;
    }
    
    var self = this;
    this.client
        .from('players')
        .select('id, total_kills')
        .ilike('username', username)
        .maybeSingle()
        .then(function(res) {
            if(res.data) {
                self.client
                    .from('players')
                    .update({ 
                        total_kills: (res.data.total_kills || 0) + 1, 
                        updated_at: new Date().toISOString() 
                    })
                    .eq('id', res.data.id)
                    .then(function() {});
            }
        })
        .catch(function() {});
};

module.exports = Database;
