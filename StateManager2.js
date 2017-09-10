var request = require('superagent-bluebird-promise');
var constant = require('./constants');
var Promise = require('bluebird');
var _ = require('lodash');

var BASE_API = 'https://api.mlab.com/api/1/databases/werewolf';
var API_KEY = 'UwuoVuL7cmJ7uaSBgZ8HWuFAKr10wTO8';
var COLLECTION_LOG = BASE_API + '/collections/logs';
var COLLECTION_SESSION = BASE_API + '/collections/sessions';
var COLLECTION_MEMBER = BASE_API + '/collections/members';
var COLLECTION_VOTE = BASE_API + '/collections/votes';

function killPlayer(playerId) {
    return new Promise(function(resolve, reject) {
        if(!playerId) {
            reject('No PlayerId supplied ');
        }

        request.put(COLLECTION_MEMBER)
        .set('Content-Type', 'application/json')
        .query({'apiKey':API_KEY})
        .query({'q':JSON.stringify({
            'member_id': playerId
        })})
        .query({
            'm': false
        })
        .send({
            '$set': {
                'is_alive': false
            }
        }).then(function(succ){
            resolve(succ.text);
            var result = JSON.parse(succ.text);

            if(result.n == 0){
                reject('Player with id = ' + playerId + ' not found');
            }else if(result.n > 1){
                reject('Illegal state, found multiple player with id = ' + playerId);
            }else{
                resolve(result);
            }
        }, function(err){
            reject(err);
        });
    });
}

function setPlayerLiveStatusByOrder(sessionId, order, status) {
    return new Promise(function(resolve, reject) {
        if(!sessionId || !order ) {
            reject('No sessionId, order or status supplied ');
        }

        request.put(COLLECTION_MEMBER)
        .set('Content-Type', 'application/json')
        .query({'apiKey':API_KEY})
        .query({'q':JSON.stringify({
            '$and': [
                {'session_id': sessionId},
                {'order': order}
            ]
        })})
        .query({
            'm': false
        })
        .send({
            '$set': {
                'is_alive': status
            }
        }).then(function(succ){
            resolve(succ.text);
            var result = JSON.parse(succ.text);

            if(result.n == 0){
                reject('Player with session_id = ' + sessionId + ' and Order = '+ order +' not found');
            }else if(result.n > 1){
                reject('Illegal state, found multiple player with session_id = ' + sessionId + ' and Order = '+ order);
            }else{
                resolve(result);
            }
        }, function(err){
            reject(err);
        });
    });
}


function createSession(group_room_id, activation_code) {
    // best thing if you can prevent duplicate from creating process
    return new Promise(function(resolve, reject){
        if(!group_room_id || !activation_code){
            reject('Neither line group id nor activation_code is provided');
        }
        request
        .post(COLLECTION_SESSION)
        .set('Content-Type', 'application/json')
        .query({'apiKey':API_KEY})
        .send({
            'admin_id': '123',
            'group_room_id': group_room_id,
            'state': 'INITIAL',
            'activation_code': activation_code,
            'timestamp_start': new Date(),
            'result': ''
        }).then(function(succ){
            resolve(JSON.parse(succ.text));
        },function(err){
            reject(err);
        });
    })
}

function getSession(sessionId) {
    return new Promise(function(resolve, reject){
        request.get(COLLECTION_SESSION)
        .set('Content-Type', 'application/json')
        .query({'apiKey':API_KEY})
        .query({'q':JSON.stringify({
            '_id': {
                '$oid': sessionId.toString()
            }
        })})
        .then(function(succ){
            var result = JSON.parse(succ.text);
            if(result.length == 1) {
                resolve(result[0]);
            }else{
                reject('Ilegal state, multiple session Id found with session Id = ' + sessionId);
            }
        },function(err){
            reject(err);
        });
    });
}

function setSessionState(sessionId, state) {
    return new Promise(function(resolve, reject) {
        if(!sessionId || !state ) {
            reject('No sessionId or State supplied ');
        }

        request.put(COLLECTION_SESSION)
        .set('Content-Type', 'application/json')
        .query({'apiKey':API_KEY})
        .query({'q':JSON.stringify({
            '_id': {
                '$oid': sessionId
            }
        })})
        .query({
            'm': false
        })
        .send({
            '$set': {
                'state': state
            }
        }).then(function(succ){
            resolve(succ.text);
            var result = JSON.parse(succ.text);

            if(result.n == 0){
                reject('Player with id = ' + playerId + ' not found');
            }else if(result.n > 1){
                reject('Illegal state, found multiple player with id = ' + playerId);
            }else{
                resolve(result);
            }
        }, function(err){
            reject(err);
        });
    });
}

function findSessionByActvCode(activation_code) {
    return new Promise(function(resolve, reject){
        if(!activation_code){
            reject('No activation_code provided ');
        }

        request.get(COLLECTION_SESSION)
        .set('Content-Type', 'application/json')
        .query({'apiKey':API_KEY})
        .query({'q':JSON.stringify({
            'activation_code':activation_code.toString()
        })})
        .then(function(succ){
            var result = JSON.parse(succ.text);
            
            if(result.length == 1){
                resolve(result[0]);
            }else if(result.length > 1) {
                reject('Found duplicate activation_code = '+activation_code);
            }else{
                reject('Session with activation_code = '+activation_code + ' not found');
            }
        },function(err){
            reject(err);
        });
    });
}

function findSessionByRoomId(room_id) {
    return new Promise(function(resolve, reject){
        if(!room_id){
            reject('No room id provided');
        }

        request.get(COLLECTION_SESSION)
        .set('Content-Type', 'application/json')
        .query({'apiKey':API_KEY})
        .query({'q':JSON.stringify({
            'group_room_id':room_id
        })})
        .then(function(succ){
            var result = JSON.parse(succ.text);
            
            if(result.length == 1){
                resolve(result[0]);
            }else if(result.length > 1) {
                reject('Illegal state Found duplicate room id = '+room_id);
            }else{
                reject('Session with room_id = '+room_id + ' not found');
            }
        },function(err){
            reject(err);
        });
    });
}

function joinSession(playerId, display_name, activation_code) {
    return new Promise(function(resolve, reject){
        findSessionByActvCode(activation_code)
        .then(function(succ){ 
            var session_id = succ._id.$oid;
            findMaxOrder(session_id).then(function(max_order){
                
                request.post(COLLECTION_MEMBER)
                .set('Content-Type', 'application/json')
                .query({'apiKey':API_KEY})
                .send({
                    'member_id': playerId,
                    'display_name':display_name,
                    'session_id': session_id,
                    'role': '',
                    'is_alive': true,
                    'order': max_order+1
                }).then(function(succ){
                    resolve(JSON.parse(succ.text));
                },function(err){
                    reject(err);
                });

            }).catch(function(err){
                reject(err);
            });
        }, function(err) {
            reject(err);
        })   
    });
}

function deleteSession(activation_code) {
    if(!activation_code) {
        reject('No activation_code provided ');
    }
    return new Promise(function(resolve, reject){
        request.put(COLLECTION_SESSION)
        .set('Content-Type', 'application/json')
        .query({'apiKey':API_KEY})
        .query({'q':JSON.stringify({
            'activation_code':activation_code
        })})
        .send([])
        .then(function(succ){
            var result = JSON.parse(succ.text);
            
            if(result.removed == 1){
                resolve(result);
            }else if(result.n > 1) {
                reject('Illegal state multiple activation_code found with activation_code = '+activation_code);
            }else{
                reject('Session with activation_code = '+activation_code + ' not found');
            }
        },function(err){
            reject(err);
        });
    });
}

function deleteMember(sesion_id) {
    return new Promise(function(resolve, reject) {
        if(!sesion_id) {
            reject('No sesion id provided');
        }

        request.put(COLLECTION_MEMBER)
        .set('Content-Type', 'application/json')
        .query({'apiKey':API_KEY})
        .query({'q':JSON.stringify({
            'session_id':sesion_id
        })})
        .send([])
        .then(function(succ){
            var result = JSON.parse(succ.text);
            resolve(result);
        }, function(err){
            reject(err);
        });
    });
}

function deleteSessionAndMember(activation_code) {
    return new Promise(function(resolve, reject){
        findSessionByActvCode(activation_code).then(function(succ){
            var session_id = JSON.parse(succ)._id;
            deleteSession(activation_code).then(function(deleted){
                deleteMember(session_id).then(resolve).catch(reject);
            }).catch(function(err){
                reject(err);
            });
        }).catch(function(err){
            reject(err);
        });
    });
}

function setRole(playerId, playerRole){
    return new Promise(function(resolve, reject) {
        if(!playerId || !playerRole) {
            reject('Neither empty playerId nor playerRole ');
        }

        request.put(COLLECTION_MEMBER)
        .set('Content-Type', 'application/json')
        .query({'apiKey':API_KEY})
        .query({'q':JSON.stringify({
            'member_id': playerId
        })})
        .query({
            'm': false
        })
        .send({
            '$set': {
                'role': playerRole
            }
        }).then(function(succ){
            resolve(succ.text);
            var result = JSON.parse(succ.text);

            if(result.n == 0){
                reject('Player with id = ' + playerId + ' not found');
            }else if(result.n > 1){
                reject('Illegal state, found multiple player with id = ' + playerId);
            }else{
                resolve(result);
            }
        }, function(err){
            reject(err);
        });
    });
}

function setDefaultRoleBySessionId(sessionId){
    return new Promise(function(resolve, reject) {
        if(!sessionId) {
            reject('No sessionId provided ');
        }

        request.put(COLLECTION_MEMBER)
        .set('Content-Type', 'application/json')
        .query({'apiKey':API_KEY})
        .query({'q':JSON.stringify({
            'session_id': sessionId
        })})
        .query({
            'm': true
        })
        .send({
            '$set': {
                'role': constant.ROLE_VILLAGER
            }
        }).then(function(succ){
            var result = JSON.parse(succ.text);
            resolve(succ.text);
        }, function(err){
            reject(err);
        });
    });
}

function setDefaultRoleByActvCode(activation_code) {
    return new Promise(function(resolve, reject){
        findSessionByActvCode(activation_code)
        .then(function(session){
            var session_id = session._id.$oid;
            setDefaultRoleBySessionId(session_id)
            .then(function(succ){
                resolve(succ);
            })
            .catch(function(err){
                reject(err);
            })
        }).catch(function(err){
            reject(err);
        })
    });
}

function getPlayer(playerId) {
    return new Promise(function(resolve, reject) {
        request.get(COLLECTION_MEMBER)
        .set('Content-Type', 'application/json')
        .query({'apiKey':API_KEY})
        .query({'q':JSON.stringify({
            'member_id':playerId
        })})
        .then(function(succ){
            var result = JSON.parse(succ.text);

            if(result.length > 1){
                reject('Illegal state, multiple playerId found with id = ' + playerId);
            }else if(result.length == 0) {
                reject('Player with id = ' + playerId + ' not found ');
            }else {
                resolve(result[0]);
            }
        }, function(err){
            reject(err);
        })
    });
}

function findPlayerByOrder(sessionId, order) {
    return new Promise(function(resolve, reject) {
        request.get(COLLECTION_MEMBER)
        .set('Content-Type', 'application/json')
        .query({'apiKey':API_KEY})
        .query({'q':JSON.stringify({
            '$and' : [
                {'order': order},
                {'session_id': sessionId}
            ]
        })})
        .then(function(succ){
            var result = JSON.parse(succ.text);

            if(result.length > 1){
                reject('Illegal state, multiple playerId found with sessionId = ' + sessionId + ' and order = '+order);
            }else if(result.length == 0) {
                reject('Player with sessionId = ' + sessionId + ' and order = ' + order + ' not found ');
            }else {
                resolve(result[0]);
            }
        }, function(err){
            reject(err);
        })
    });
}

function getRole(playerId){
    return new Promise(function(resolve, reject) {
        getPlayer(playerId).then(function(player){
            resolve(player.role);
        }).catch(reject);
    });
}

function healPlayer(playerId) {
    return new Promise(function(resolve, reject) {
        if(!playerId) {
            reject('No PlayerId supplied ');
        }

        request.put(COLLECTION_MEMBER)
        .set('Content-Type', 'application/json')
        .query({'apiKey':API_KEY})
        .query({'q':JSON.stringify({
            'member_id': playerId
        })})
        .query({
            'm': false
        })
        .send({
            '$set': {
                'is_alive': true
            }
        }).then(function(succ){
            resolve(succ.text);
            var result = JSON.parse(succ.text);

            if(result.n == 0){
                reject('Player with id = ' + playerId + ' not found');
            }else if(result.n > 1){
                reject('Illegal state, found multiple player with id = ' + playerId);
            }else{
                resolve(result);
            }
        }, function(err){
            reject(err);
        });
    });
}


/**
 * Utilities functions 
 */

function findMaxOrder(session_id) {
    return new Promise(function(resolve, reject){ 
        request.get(COLLECTION_MEMBER)
        .set('Content-Type', 'application/json')
        .query({'apiKey':API_KEY})
        .query({'q':JSON.stringify({
            'session_id':session_id
        })})
        .query({'s':JSON.stringify({
            'order':-1
        })})
        .query({'l':1})
        .then(function(succ){
            var result = JSON.parse(succ.text);
            if(result.length > 0){
                var maximum_order = result[0].order || 0;
                resolve(maximum_order);    
            }else{
                resolve(0);
            }
        },function(err){
            reject(err);
        });
    });
}

function countRolesAlive(room_id){
    return new Promise(function(resolve, reject){
        findAlive(room_id)
        .then(function(players){
            var groupped = _.countBy(players,'role');
            resolve(groupped);
        })
        .catch(function(err){
            reject(err);
        })
    });
}

function findAlive(room_id) {
    return new Promise(function(resolve, reject){
        findSessionByRoomId(room_id).then(function(session){
            var session_id = session._id.$oid;

            request.get(COLLECTION_MEMBER)
            .set('Content-Type', 'application/json')
            .query({'apiKey':API_KEY})
            .query({'q':JSON.stringify({
                '$and':[
                    {'session_id':session_id},
                    {'is_alive':true}
                ]
            })})
            .then(function(succ){
                var result = JSON.parse(succ.text);
                resolve(result);
            },function(err){
                reject(err);
            })
        }).catch(function(err){
            reject(err);
        })
    });
    // should return like this (if return_only_alive set to false) :
    // It will be used for doctor to heal, or suspect someone..
    // [{display_name: a, is_alive: true}, {display_name: b, is_alive: false}]
    // should return like this (if return_only_alive set to true) : 
    // It will be used when leeching someone, or killing people in the night
    // [{display_name: a, is_alive: true}]
}

function findPlayerByRoomId(room_id){
    return new Promise(function(resolve, reject){
        findSessionByRoomId(room_id)
        .then(function(session){
            var session_id = session._id.$oid;

            request.get(COLLECTION_MEMBER)
            .set('Content-Type', 'application/json')
            .query({'apiKey':API_KEY})
            .query({'q':JSON.stringify({
                'session_id':session_id
            })})
            .query({'f':JSON.stringify({
                'display_name':1, // should be display_name
                'is_alive':1,
                'role':1
            })})
            .then(function(succ){
                var result = JSON.parse(succ.text);
                resolve(result);
            },function(err){
                reject(err);
            })
        })
        .catch(function(err){
            reject(err);
        });
    });
}

function findPlayerByActvCode(activation_code){
    return new Promise(function(resolve, reject){
        findSessionByActvCode(activation_code)
        .then(function(session){
            var session_id = session._id.$oid;

            findPlayerBySessionId(session_id)
            .then(function(succ){
                resolve(succ);
            })
            .catch(function(err){
                reject(err);
            })
        })
        .catch(function(err){
            reject(err);
        });
    });
}

function findPlayerBySessionId(sessionId){
    return new Promise(function(resolve, reject){
        request.get(COLLECTION_MEMBER)
        .set('Content-Type', 'application/json')
        .query({'apiKey':API_KEY})
        .query({'q':JSON.stringify({
            'session_id':sessionId
        })})
        .query({'f':JSON.stringify({
            'display_name':1, // should be display_name
            'is_alive':1,
            'role':1,
            'member_id': 1,
            'order': 1
        })})
        .then(function(succ){
            var result = JSON.parse(succ.text);
            resolve(result);
        },function(err){
            reject(err);
        });
    });
}

function findPlayerWithRoleByRoomId(roomId, role){
    return new Promise(function(resolve, reject){
        findSessionByRoomId(roomId)
        .then(function(session){
            var session_id = session._id.$oid;
            
            findPlayerWithRoleBySessionId(session_id, role)
            .then(function(succ){
                resolve(succ);
            }).catch(function(err){
                reject(err);
            })
        })
        .catch(function(err){
            reject(err);
        });
    });
}

function findPlayerWithRoleBySessionId(sessionId, role) {
    return new Promise(function(resolve, reject) {
        request.get(COLLECTION_MEMBER)
        .set('Content-Type', 'application/json')
        .query({'apiKey':API_KEY})
        .query({'q':JSON.stringify({
            '$and':[
                {'session_id': sessionId},
                {'role': role},
                {'is_alive': true}
            ]
        })})
        .query({'f':JSON.stringify({
            'member_id':1, // should be display_name
            'display_name':1,
        })})
        .then(function(succ){
            var result = JSON.parse(succ.text);
            resolve(result);
        },function(err){
            reject(err);
        });
    });
}

function writeLog(message) {
    return new Promise(function(resolve, reject){
        request
        .post(COLLECTION_LOG)
        .set('Content-Type', 'application/json')
        .query({'apiKey':API_KEY})
        .send({
            'message': message
        }).then(function(succ){
            resolve(JSON.parse(succ.text));
        },function(err){
            reject(err);
        });
    });
}

function getVote(sessionId, action, playerOrder) {
    return new Promise(function(resolve, reject){
        request.get(COLLECTION_VOTE)
        .set('Content-Type', 'application/json')
        .query({'apiKey':API_KEY})
        .query({'q':JSON.stringify({
            '$and':[
                    {'session_id':sessionId},
                    {'action':action},
                    {'order':playerOrder}
                ]
        })})
        .then(function(succ){
            var result = JSON.parse(succ.text);
            if(result.length == 1){
                resolve(result[0]);
            }else if(result.length > 1) {
                reject('Found duplicate vote with sessionId = '+sessionId + ' action = ' + action + ' playerOrder ' + playerOrder);
            }else{
                // not found, return default empty object
                resolve({
                    'session_id':sessionId,
                    'action':action,
                    'order':playerOrder,
                    'count': 0
                });
            }
        },function(err){
            reject(err);
        });
    });
}

function voteUp(sessionId, action, playerOrder) {
    // get vote first, then increment.. 
    return new Promise(function(resolve, reject){
        getVote(sessionId, action, playerOrder)
        .then(function(vote){
            var vote_counter = vote.count;
            
            request
            .put(COLLECTION_VOTE)
            .set('Content-Type','application/json')
            .query({'apiKey':API_KEY})
            .query({'q':JSON.stringify({
                '$and':[
                        {'session_id':sessionId},
                        {'action':action},
                        {'order':playerOrder}
                    ]
            })})
            .query({
                'm': false
            })
            .query({
                'u': true
            })
            .send({
                '$set': {
                    'count': vote_counter + 1
                }
            })
            .then(function(succ){
                var result = JSON.parse(succ.text);
                resolve(result);
            },function(err){
                reject(err);
            });

        })
        .catch(function(err){
            reject(err);
        })
    });
}

function findMaxVoteCount(sessionId, action) {
    return new Promise(function(resolve, reject){
        request.get(COLLECTION_VOTE)
        .set('Content-Type', 'application/json')
        .query({'apiKey':API_KEY})
        .query({'q':JSON.stringify({
            '$and':[
                    {'session_id':sessionId},
                    {'action':action}
                ]
        })})
        .query({'s':JSON.stringify({
            'count':-1
        })})
        .query({'l':1})
        .then(function(succ){
            var result = JSON.parse(succ.text);
            if(result.length > 0){
                var maximum_count = result[0].count || 0;
                resolve(maximum_count);    
            }else{
                resolve(0);
            }
        },function(err){
            reject(err);
        });
    });
}

function getOrderVoted(sessionId, action) {
    return new Promise(function(resolve, reject){
        findMaxVoteCount(sessionId, action)
        .then(function(vote_count){
            // if found several vote with count = maximum count, then randomize

            request.get(COLLECTION_VOTE)
            .set('Content-Type', 'application/json')
            .query({'apiKey':API_KEY})
            .query({'q':JSON.stringify({
                '$and':[
                        {'session_id':sessionId},
                        {'action':action},
                        {'count': vote_count}
                    ]
            })})
            .then(function(succ){
                var result = JSON.parse(succ.text);

                if(result.length == 0) {
                    reject('Illegal state, no one is voted');
                }else if(result.length == 1) {
                    var orderVoted = result[0].order;
                    resolve(orderVoted);
                }else if(result.length > 1) {
                    var selected = result[Math.floor(Math.random() * result.length)];
                    var orderVoted = selected.order;
                    resolve(orderVoted);
                }
            },function(err){
                reject(err);
            }); 
        }).catch(function(err){
            reject(err);
        });
    });
}

function countVote(sessionId, action) {
    return new Promise(function(resolve, reject){
        request.get(COLLECTION_VOTE)
        .set('Content-Type', 'application/json')
        .query({'apiKey':API_KEY})
        .query({'q':JSON.stringify({
            '$and':[
                    {'session_id':sessionId},
                    {'action':action}
                ]
        })})
        .then(function(succ){
            var result = JSON.parse(succ.text);
            var total_vote = 0;
            for (var i = 0; i < result.length; i++) {
                var vote = result[i];
                total_vote = total_vote + vote.count;
            }
            resolve(total_vote);
        },function(err){
            reject(err);
        }); 
    });
}

function clearVote(sessionId, action) {
    return new Promise(function(resolve, reject){
        request.put(COLLECTION_VOTE)
        .set('Content-Type', 'application/json')
        .query({'apiKey':API_KEY})
        .query({'q':JSON.stringify({
            '$and':[
                    {'session_id':sessionId},
                    {'action':action}
                ]
        })})
        .send([])
        .then(function(succ){
            var result = JSON.parse(succ.text);
            resolve(result);
        },function(err){
            reject(err);
        });
    });
}

function markPlayerAlreadyVoted(userId) {
    return new Promise(function(resolve, reject) {
        if(!userId) {
            reject('empty userId provided');
        }

        request.put(COLLECTION_MEMBER)
        .set('Content-Type', 'application/json')
        .query({'apiKey':API_KEY})
        .query({'q':JSON.stringify({
            'member_id': userId
        })})
        .query({
            'm': false
        })
        .send({
            '$set': {
                'voted': true
            }
        }).then(function(succ){
            resolve(succ.text);
            var result = JSON.parse(succ.text);

            if(result.n == 0){
                reject('Player with id = ' + userId + ' not found');
            }else if(result.n > 1){
                reject('Illegal state, found multiple player with id = ' + playerId);
            }else{
                resolve(result);
            }
        }, function(err){
            reject(err);
        });
    });
}

function resetVoteMark(sessionId) {
    return new Promise(function(resolve, reject) {
        if(!sessionId) {
            reject('empty sessionId provided');
        }

        request.put(COLLECTION_MEMBER)
        .set('Content-Type', 'application/json')
        .query({'apiKey':API_KEY})
        .query({'q':JSON.stringify({
            'session_id': sessionId
        })})
        .query({
            'm': true
        })
        .send({
            '$set': {
                'voted': false
            }
        }).then(function(succ){
            resolve(succ.text);
            var result = JSON.parse(succ.text);
            resolve(result);
        }, function(err){
            reject(err);
        });
    });
}

/**
 * POTENTIAL IMPROVEMENT
 * 
 * Problem : 
 * - when inserting a player, order column in member collection become unordered due to js async 
 * - (retrieved from server some max id while the new join not inserted yet to db) 
 * Fix (Potential)
 * - order field (in member collection) should be a global increment field. 
 * - substract the order, with most minimum order with session equal to the sesion that new player want to be inserted
 * 
 * Problem :
 * - When choosing someone to be killed or leeched, you need to verify that the one that wants to be killed/leeched is alive
 * - You can't leech/kill someone whose already dead
 */


/**
 * TEST CASE
 */

// createSession('123','9999')
// .then(function(res){
    
// }, function(err) {
//     console.log(err);
// });

// joinSession('123').then(function(succ){
//     console.log(JSON.parse(succ.text));
// }, function(err) {
//     console.log(err);
// });

// findSessionByActvCode('9999').then(function(succ){
//     console.log(JSON.parse(succ));
// }).catch(function(err){
//     console.log(err);
// });

function succCallback(succ){
    console.log(succ);
}

function errCallback(err){
    console.log(err);
}

// Should create a new session
// createSession('room_321','9998').then(succCallback).catch(errCallback);

// Should find above session
// findSessionByActvCode('9998').then(succCallback).catch(errCallback);
// findSessionByActvCode('000').then(succCallback).catch(errCallback);

// should join a member to new session
// joinSession('member_4447', 'sule', '9998').then(succCallback).catch(errCallback);
// joinSession('member_4448', 'andre', '9998').then(succCallback).catch(errCallback);
// joinSession('member_4449', 'nunung', '9998').then(succCallback).catch(errCallback);
// Should return error no session with activation code found
// createSession('room_123','99').then(succCallback).catch(errCallback);

// should delete a session 
// deleteSession('9998').then(succCallback).catch(errCallback);

// findSessionByActvCode('9998').then(function(succ){
//     var session_id = succ._id.$oid;
//     deleteMember(session_id).then(succCallback);
// });


// Should setRole for member
// setRole('member_4448',constant.ROLE_SEER).then(succCallback).catch(errCallback);

// should getrole for member
// getRole('member_4447').then(succCallback).catch(errCallback);

// healPlayer('member_4447').then(succCallback).catch(errCallback);
// killPlayer('member_4447').then(succCallback).catch(errCallback);

// findMaxOrder('9998').then(succCallback).catch(errCallback);

// should find by room id
// findSessionByRoomId('room_321').then(succCallback).catch(errCallback);

// should return ONLY alive
// findPlayerByRoomId('room_321').then(succCallback).catch(errCallback);

// should group by role
// countRolesAlive('room_1').then(succCallback).catch(errCallback);

// writeLog('test aja').then(succCallback).catch(errCallback);

// findPlayerByActvCode('4055').then(succCallback).catch(errCallback);

// getPlayer('member_4447').then(succCallback).catch(errCallback);


// Vote related
// voteUp('5953d2e6c2ef164ab2db74f4','kill',2).then(succCallback).catch(errCallback);
// voteUp('session_1','kill',1).then(succCallback).catch(errCallback);
// findMaxVoteCount('session_1','kill').then(succCallback).catch(errCallback);
// getOrderVoted('session_1','kill').then(succCallback).catch(errCallback);
// clearVote('session_1','kill').then(succCallback).catch(errCallback);
// countVote('5953d2e6c2ef164ab2db74f4','kill').then(succCallback).catch(errCallback);
// resetVoteMark('5953d2e6c2ef164ab2db74f4').then(succCallback).catch(errCallback);

// Untuk reset awal
// setDefaultRoleByActvCode('4055').then(succCallback);
// setSessionState('5953d2e6c2ef164ab2db74f4','INITIAL').then(succCallback);
// setPlayerLiveStatusByOrder('5953d2e6c2ef164ab2db74f4',1, true).then(succCallback);
// setPlayerLiveStatusByOrder('5953d2e6c2ef164ab2db74f4',2, true).then(succCallback);
// setPlayerLiveStatusByOrder('5953d2e6c2ef164ab2db74f4',3, true).then(succCallback);
// setPlayerLiveStatusByOrder('5953d2e6c2ef164ab2db74f4',4, true).then(succCallback);
// setPlayerLiveStatusByOrder('5953d2e6c2ef164ab2db74f4',5, true).then(succCallback);
// setPlayerLiveStatusByOrder('5953d2e6c2ef164ab2db74f4',6, true).then(succCallback);
// setPlayerLiveStatusByOrder('5953d2e6c2ef164ab2db74f4',7, true).then(succCallback);
// setPlayerLiveStatusByOrder('5953d2e6c2ef164ab2db74f4',8, true).then(succCallback);
// findAlive('room_1').then(succCallback).catch(errCallback);

// findPlayerWithRoleByRoomId('room_1','werewolf').then(succCallback).catch(errCallback);
// findPlayerBySessionId('5953d2e6c2ef164ab2db74f4').then(succCallback).catch(errCallback);
// getSession('5953d2e6c2ef164ab2db74f4').then(succCallback).catch(errCallback);
// setSessionState('5953d2e6c2ef164ab2db74f4', 'kill').then(succCallback)catch(errCallback);
// findPlayerByOrder('5953d2e6c2ef164ab2db74f4',1).then(succCallback).catch(errCallback);

// setPlayerLiveStatusByOrder('5953d2e6c2ef164ab2db74f4',1, false).then(succCallback).catch(errCallback);

// findAlive('room_1').then(succCallback).catch(errCallback);

module.exports = {
    'killPlayer': killPlayer,
    'createSession': createSession,
    'findSessionByActvCode': findSessionByActvCode,
    'findSessionByRoomId': findSessionByRoomId,
    'getSession': getSession,
    'setSessionState': setSessionState,
    'joinSession': joinSession,
    'deleteSession': deleteSession,
    'deleteMember': deleteMember,
    'deleteSessionAndMember': deleteSessionAndMember,
    'setRole': setRole,
    'setPlayerLiveStatusByOrder': setPlayerLiveStatusByOrder,
    'getPlayer': getPlayer,
    'getRole': getRole,
    'healPlayer': healPlayer,
    'findMaxOrder': findMaxOrder,
    'countRolesAlive': countRolesAlive,
    'findAlive': findAlive,
    'findPlayerByRoomId': findPlayerByRoomId,
    'writeLog': writeLog,
    'succCallback': succCallback,
    'errCallback': errCallback,
    'findPlayerByActvCode': findPlayerByActvCode,
    'findPlayerBySessionId': findPlayerBySessionId,
    'findPlayerWithRoleByRoomId': findPlayerWithRoleByRoomId,
    'findPlayerWithRoleBySessionId': findPlayerWithRoleBySessionId,
    'setDefaultRoleByActvCode': setDefaultRoleByActvCode,
    'findPlayerByOrder' : findPlayerByOrder,
    'voteUp': voteUp,
    'countVote': countVote,
    'getOrderVoted': getOrderVoted,
    'clearVote':clearVote,
    'markPlayerAlreadyVoted':markPlayerAlreadyVoted,
    'resetVoteMark': resetVoteMark
}