
var cls = require("./lib/class"),
    url = require('url'),
    WebSocketServer = require('websocket').server,
    http = require('http'),
    Utils = require('./utils'),
    _ = require('underscore'),
    WS = {};

module.exports = WS;

/**
 * Abstract Server and Connection classes
 */
var Server = cls.Class.extend({
    init: function(port) {
        this.port = port;
    },
    
    onConnect: function(callback) {
        this.connection_callback = callback;
    },
    
    onError: function(callback) {
        this.error_callback = callback;
    },
    
    broadcast: function(message) {
        throw "Not implemented";
    },
    
    forEachConnection: function(callback) {
        _.each(this._connections, callback);
    },
    
    addConnection: function(connection) {
        this._connections[connection.id] = connection;
    },
    
    removeConnection: function(id) {
        delete this._connections[id];
    },
    
    getConnection: function(id) {
        return this._connections[id];
    }
});


var Connection = cls.Class.extend({
    init: function(id, connection, server) {
        this._connection = connection;
        this._server = server;
        this.id = id;
    },
    
    onClose: function(callback) {
        this.close_callback = callback;
    },
    
    listen: function(callback) {
        this.listen_callback = callback;
    },
    
    broadcast: function(message) {
        throw "Not implemented";
    },
    
    send: function(message) {
        throw "Not implemented";
    },
    
    sendUTF8: function(data) {
        throw "Not implemented";
    },
    
    close: function(logError) {
        var remote = (this._connection && this._connection.remoteAddress) ? this._connection.remoteAddress : "unknown";
        if(typeof log !== "undefined" && log.info) {
            log.info("Closing connection to " + remote + (logError ? ". Error: " + logError : ""));
        }
        if(this._connection && this._connection.close) {
            this._connection.close();
        }
    }
});


/**
 * MultiVersionWebsocketServer
 * 
 * Standard RFC 6455 WebSocket server using WebSocket-Node.
 */
WS.MultiVersionWebsocketServer = Server.extend({
    serverConfig: {
        maxReceivedFrameSize: 0x10000,
        maxReceivedMessageSize: 0x100000,
        fragmentOutgoingMessages: true,
        fragmentationThreshold: 0x4000,
        keepalive: true,
        keepaliveInterval: 20000,
        assembleFragments: true,
        disableNagleAlgorithm: true,
        closeTimeout: 5000,
        autoAcceptConnections: false
    },
    _connections: {},
    _counter: 0,
    
    init: function(port, allowedOrigins) {
        var self = this;
        
        this._super(port);
        this.allowedOrigins = allowedOrigins || null;
        this._connections = {};
        
        this._httpServer = http.createServer(function(request, response) {
            response.setHeader('X-Content-Type-Options', 'nosniff');
            var pathname = "";
            try {
                pathname = new URL(request.url, "http://" + (request.headers.host || "localhost")).pathname;
            } catch(e) {
                pathname = request.url;
            }
            
            switch(pathname) {
                case '/status':
                    if(self.status_callback) {
                        response.writeHead(200, { 'Content-Type': 'application/json' });
                        response.write(self.status_callback());
                        break;
                    }
                default:
                    response.writeHead(404, { 'Content-Type': 'text/plain' });
                    response.write("Not found");
            }
            response.end();
        });
        
        this._httpServer.listen(port, function() {
            if(typeof log !== "undefined" && log.info) {
                log.info("Server is listening on port " + port);
            }
        });
        
        var wsConfig = _.extend({ httpServer: this._httpServer }, this.serverConfig);
        this._wsServer = new WebSocketServer(wsConfig);
        
        this._wsServer.on('request', function(request) {
            if(self.allowedOrigins && !self.isOriginAllowed(request.origin)) {
                request.reject(403, "Origin not allowed");
                if(typeof log !== "undefined" && log.error) {
                    log.error("Rejected connection from unauthorized origin: " + request.origin);
                }
                return;
            }
            
            try {
                var protocol = request.requestedProtocols && request.requestedProtocols[0] ? request.requestedProtocols[0] : null;
                var wsConnection = request.accept(protocol, request.origin);
                var c = new WS.worlizeWebSocketConnection(self._createId(), wsConnection, self);
                
                if(self.connection_callback) {
                    self.connection_callback(c);
                }
                self.addConnection(c);
            } catch(e) {
                if(typeof log !== "undefined" && log.error) {
                    log.error("WebSocket request error: " + e.toString());
                }
            }
        });
    },
    
    isOriginAllowed: function(origin) {
        if(!this.allowedOrigins || this.allowedOrigins.length === 0) {
            return true;
        }
        return _.contains(this.allowedOrigins, origin);
    },
    
    _createId: function() {
        return '5' + Utils.random(99) + '' + (this._counter++);
    },
    
    broadcast: function(message) {
        this.forEachConnection(function(connection) {
            connection.send(message);
        });
    },
    
    onRequestStatus: function(status_callback) {
        this.status_callback = status_callback;
    }
});


/**
 * Connection class for Websocket-Node
 */
WS.worlizeWebSocketConnection = Connection.extend({
    init: function(id, connection, server) {
        var self = this;
        
        this._super(id, connection, server);
        
        this._connection.on('message', function(message) {
            if(self.listen_callback && message.type === 'utf8') {
                try {
                    var parsed = JSON.parse(message.utf8Data);
                    self.listen_callback(parsed);
                } catch(e) {
                    self.close("Received message was not valid JSON.");
                }
            }
        });
        
        this._connection.on('close', function(reasonCode, description) {
            if(self.close_callback) {
                self.close_callback();
            }
            self._server.removeConnection(self.id);
        });
        
        this._connection.on('error', function(err) {
            if(typeof log !== "undefined" && log.error) {
                log.error("WebSocket connection error (" + self.id + "): " + err.toString());
            }
        });
    },
    
    send: function(message) {
        try {
            var data = JSON.stringify(message);
            this.sendUTF8(data);
        } catch(e) {
            if(typeof log !== "undefined" && log.error) {
                log.error("Error serializing WebSocket message: " + e.toString());
            }
        }
    },
    
    sendUTF8: function(data) {
        try {
            this._connection.sendUTF(data);
        } catch(e) {
            if(typeof log !== "undefined" && log.error) {
                log.error("Error sending UTF8 data: " + e.toString());
            }
        }
    }
});

// Backward compatibility alias
WS.miksagoWebSocketConnection = WS.worlizeWebSocketConnection;
