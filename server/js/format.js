
var _ = require('underscore'),
    Types = require("../../shared/js/gametypes");

(function() {
    FormatChecker = Class.extend({
        init: function() {
            this.formats = [];
            this.formats[Types.Messages.HELLO] = ['s', 'n', 'n'],
            this.formats[Types.Messages.MOVE] = ['n', 'n'],
            this.formats[Types.Messages.LOOTMOVE] = ['n', 'n', 'n'],
            this.formats[Types.Messages.AGGRO] = ['n'],
            this.formats[Types.Messages.ATTACK] = ['n'],
            this.formats[Types.Messages.HIT] = ['n'],
            this.formats[Types.Messages.HURT] = ['n'],
            this.formats[Types.Messages.CHAT] = ['s'],
            this.formats[Types.Messages.LOOT] = ['n'],
            this.formats[Types.Messages.TELEPORT] = ['n', 'n'],
            this.formats[Types.Messages.ZONE] = [],
            this.formats[Types.Messages.OPEN] = ['n'],
            this.formats[Types.Messages.CHECK] = ['n']
        },
        
        check: function(msg) {
            if(!Array.isArray(msg) || msg.length === 0) {
                return false;
            }
            var type = msg[0];
            if(!Number.isInteger(type) || type < 0) {
                return false;
            }
            
            var format = Object.prototype.hasOwnProperty.call(this.formats, type) ? this.formats[type] : null;
            
            if(format) {    
                if(msg.length - 1 !== format.length) {
                    return false;
                }
                for(var i = 0, n = format.length; i < n; i += 1) {
                    var val = msg[i + 1];
                    if(format[i] === 'n') {
                        if(!Number.isInteger(val)) {
                            return false;
                        }
                    } else if(format[i] === 's') {
                        if(typeof val !== 'string' || val.length > 512) {
                            return false;
                        }
                    }
                }
                return true;
            }
            else if(type === Types.Messages.WHO) {
                // WHO messages have a variable amount of params, all of which must be integers (max 100).
                if(msg.length <= 1 || msg.length > 101) {
                    return false;
                }
                for(var j = 1; j < msg.length; j += 1) {
                    if(!Number.isInteger(msg[j])) {
                        return false;
                    }
                }
                return true;
            }
            else {
                if(typeof log !== "undefined" && log.error) {
                    log.error("Unknown message type: " + type);
                }
                return false;
            }
        }
    });

    var checker = new FormatChecker();
    
    exports.check = checker.check.bind(checker);
})();