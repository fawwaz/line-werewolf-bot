/**
 * CONTROLLER : berfungsi untuk mengatur bagian logic dari app
 * Mostly tentang validation command input (apakah usernya punya privillage tsb dll), logic statenya
 * Mengendalikan message apa yang harus direply ke user
 */
var Promise = require('bluebird');
var myclient = undefined;
var Parser = require('./Parser');
var StateManager = require('./StateManager2');
var Timeout = require('./timeout');

function setClient(lineclient) {
  return myclient = lineclient;
}

function replyMessage(event, replytext) {
  return myclient.replyMessage(event.replyToken, {
    'type': 'text',
    'text': replytext
  });
}

function pushMessage(to, pushMessage) {
  return myclient.pushMessage(to, {
    'type': 'text',
    'text': pushMessage
  })
}

function getProfile(userId) {
  return myclient.getProfile(userId);
}

function decideAction(event) {
  if (event.type !== 'message' || event.message.type !== 'text') {
    return Promise.resolve(null);
  }

  try{
    var action_obj = Parser.parse(event.message.text);
    var action_type = action_obj.type;
    var action_src = event.source.type;
    var action_src_id = getSourceId(event);

    if (action_src == "group" || action_src == "room") {
      if (action_type == "start_game") {
        return handleStartGame(action_src_id);
        // return replyMessage(event.replyToken, JSON.stringify(action_obj)); 
      } else {
        // use push message instead ?? maybe ?
        return replyMessage(event.replyToken, 'Ups Perintah yang kamu masukan salah. Bot hanya menerima perintah start_game di group chat / multi chat. Serta action individu di chat personal (join_game / heal / leech / kill ). Pastikan format sesuai'); 
      }
    }else if (action_src == "user") {
      if (action_type == "heal") {
        return handleHeal(action_src_id, action_obj, event);
      }else if (action_type == "leech") {
        return handleLeech(action_src_id, action_obj, event); 
      }else if (action_type == "kill") {
        console.log(action_obj);
        return handleKill(action_src_id, action_obj, event);
      }else if (action_type == "join_game") {
        console.log(action_obj);
        return handleJoinGame(action_src_id, action_obj, event);
        // return replyMessage(event.replyToken, JSON.stringify(action_obj)); 
      }else{
        return replyMessage(event.replyToken, 'Ups Perintah yang kamu masukan salah. Bot hanya menerima perintah start_game di group chat / multi chat. Serta action individu di chat personal (join_game / heal / leech / kill ). Pastikan format sesuai'); 
      }
    }else {
      // other than group / room / user , consider it as incorrect legal action
      return replyMessage(event.replyToken, 'Ups Perintah yang kamu masukan salah. Bot hanya menerima perintah start_game di group chat / multi chat. Serta action individu di chat personal (join_game / heal / leech / kill ). Pastikan format sesuai'); 
    }
  } catch(err) {
    // better to check error instance, if the error comes from PEG JS error then show the warning to user
    console.log(err);
    return replyMessage(event.replyToken, 'Ups Perintah yang kamu masukan salah. Bot hanya menerima perintah start_game di group chat / multi chat. Serta action individu di chat personal (join_game / heal / leech / kill ). Pastikan format sesuai');
  }
}

/**
 * Utilities functions 
 */

function getSourceId(event) {
  var evnt_src = event.source.type;
  if (evnt_src == "group") {
    return event.source.groupId;
  }else if (evnt_src == "room") {
    return event.source.roomId;
  }else if (evnt_src == "user") {
    return event.source.userId;
  } else {
    return undefined;
  }
}

function handleStartGame(roomId) {
  // harusnya bukan 1 room id melambangkan 1 session id, tapi dicek berdasakan state, kalau kaya gini gak bisa simpen result. (unless di collection yang lain)
  console.log(roomId);
  StateManager.findSessionByRoomId(roomId).then(function(session){
    // the session already started, ignore user input send a warning message
    return pushMessage(roomId,'Sesi game sedang dimulai, tunggu hingga game ini berakhir untuk memulai sesi game yang baru.');
  }).catch(function(err){
    //var activation_code = 9999; // sementara ini dihardcode, harusnya dirandom
    var activation_code = pad(randomize(0,9999),4);
    console.log("activation code : " + activation_code);

    StateManager.createSession(roomId, activation_code).then(function(session){
      // Nyoba timeout
      console.log("setting up a timeout to automatically move to (supposed to cancel the game) on ");
      showTime();
      var sessionId = session._id.$oid;
      var durasi = 1000 * 60 * 1;
      Timeout.set('timeout_'+sessionId, function(){ //harusnya bukan roomId, tapi sessionId
        console.log('timeout tereksekusi untuk room : '+ sessionId); // disini harusnya clear session
      }, durasi);

      return pushMessage(roomId,'Menunggu player untuk bergabung, silahkan add bot ini dan chat personal ke bot ini dengan mengetikan `join_game '+activation_code+'`.');
    }).catch(function(err2){
      return pushMessage(roomId,"Error in handleStartGame function message: "+ err2.toString());
    })
  });
  // check if it started or not
  // else send a message telling that only one session allowed for same room
}

function handleJoinGame(userId, action_obj, event) {
  // already joined or not and game session in  INITIAL STATE
  var actv_code = action_obj.payload;
  StateManager.findSessionByActvCode(actv_code).then(function(session){
    var sessionId = session._id.$oid;
    if(session.state != 'INITIAL') {
     return replyMessage(event, 'Kamu hanya bisa bergabung saat game belum berlangsung. Tunggu hingga ada game sesi baru');
    }else{
      StateManager.getPlayer(userId).then(function(player){
        // then the player already registered,
        // some bugs: a player is registered while playing in other room (double play)
        // tp setelah dipikir, ini bukan bugs justru bagus biar si botnya gak pusing kalau doble play, karena bisa jadi 2 role yang berebda di game berbeda pada waktu berasamaan..
        return replyMessage(event, 'Kamu sudah pernah bergabung dalam sesi ini');
      }).catch(function(err){
        getProfile(userId).then(function(user){
          var displayName = user.displayName;
          return StateManager.joinSession(userId,displayName, actv_code).then(function(succ){
            checkCancelGameOrInitGame(actv_code, sessionId);
            return replyMessage(event, 'Terimakasih sudah bergabung, ajak player lain hingga memenuhi batas minimum jumlah player untuk memulai game !');
          }).catch(function(err2){
            return pushMessage(userId,"Error in handleJoinGame function message: "+ err2.toString());
          });
        });
      });
    }
  }).catch(function(err){
    pushMessage(userId,"Error in handleJoingame function message: "+ err.toString());
  });
}

function handleKill(action_src_id, action_obj, event){
  // 0. // broadcast a message to each werewolf everytime a werewolf pick someone, (they must agree with a person or, the system will pick a random person from a subset they suggest)
  // 0. PENTING, cek juga si werewolf yang nge-vote dalam kodnsii hidupp atau enggak
  // 1. convert action_obj payload from "order" to lineUserId - no need
  // 2. validate that the lineUserId role (must be a werewolf)
  StateManager.getPlayer(action_src_id).then(function(player){
    if(player.role == 'werewolf') {
      if(player.is_alive) {
        var session_id = player.session_id;
        StateManager.getSession(session_id).then(function(session){
          if(session.state != 'kill'){
            replyMessage(event.replyToken, 'Kamu hanya bisa membunuh saat giliran kamu (malam hari)');
          }else{
            // vote up dan broadcast message, jangan lupa untuk clear kalau turnnya udah selesai kasih timeout 
            // validasi terakhir:  HARUSNYA GAK BOLEH VOTE dua kali
            if(!player.voted) {
              var playerOrder = action_obj.payload;
              StateManager.findPlayerByOrder(session_id, playerOrder).then(function(victim){
                if(victim.is_alive){
                  StateManager.voteUp(session_id, 'kill', playerOrder).then(function(){
                    StateManager.markPlayerAlreadyVoted(action_src_id);
                    broadcastVoteKillMessage(session_id, action_src_id, action_obj, event);
                    checkWaitOrAutoKill(session);
                  });
                }else{
                  replyMessage(event.replyToken, 'Kamu hanya bisa membunuh orang yang masih hidup');
                }
              });
            }else{
              replyMessage(event.replyToken, 'Maaf kamu sudah melakukan voting.');
            }
          }
        });
      }else{
        replyMessage(event.replyToken, 'Maaf kamu sudah mati digantung');  
      }
    }else{
      replyMessage(event.replyToken, 'Maaf kamu bukan serigala');
    }
  }).catch(function(err){
    StateManager.writeLog("Error in handleKill function, "+ err);
    replyMessage(event.replyToken, 'An error occured in handleKill function, please report it to fawwaz muhammad');
  });
  // 3. validate that the command is executed while in his turn (must be in the night and within werewolf session)
  // 4. If there is more than 1 werewolf , all werewolf must agree whom to kill (put a brodcast message for every wereowlf who is choosing whom)
  // 5. By the end of successfull kill selection, set the game state turn to doctor
}

function handleHeal(userId, action_obj, event){
  // 1. convert action_obj payload from "order" to lineUserId -- no need
  // 2. validate that the lineUserId role (must be a doctor)
  // oiya tambahin flag juga apakah lastnight si doctor berhasil menyembuhkan atau tidak, untuk diumumkan di siang hari
  // cara cek berhasil / gak, kalau yang diheal = orang yang mati. tadi malam, bukan orang yang sudah pernah mati
  StateManager.getPlayer(userId).then(function(healer){
    if(healer.role == 'doctor') {
      var session_id = healer.session_id;
      StateManager.getSession(session_id).then(function(session){
        if(session.state != 'heal') {
          replyMessage(event.replyToken, 'Kamu hanya bisa menyembuhkan saat giliran kamu bekerja');
        } else {
          var playerOrder = action_obj.payload;
          StateManager.findPlayerByOrder(session_id, playerOrder).then(function(patient){
            if(patient.is_alive) {
              if(!healer.voted){
                StateManager.voteUp(session_id, 'heal', playerOrder).then(function(){
                  StateManager.markPlayerAlreadyVoted(userId).then(function(){
                    broadcastVoteHealMessage(session_id, userId, action_obj, event);
                    checkWaitOrAutoHeal(session);
                  });
                });
              }else{
                replyMessage(event.replyToken, 'Maaf kamu sudah pernah voting sebelumnya');  
              }
            } else {
              replyMessage(event.replyToken, 'Kamu hanya bisa menyembuhkan orang yang masih hidup');
            }
          });
        }
      });
    }else{
      replyMessage(event.replyToken, 'Maaf kamu bukan doctor');
    }
  });
  // 3. validate that the command is executed while in his turn (must be in the night and within doctor session)
  // 4. If there is more than 1 doctor , all doctor must agree whom to heal (put a brodcast message for every doctor who is choosing whom)
  // 5. By the end of successfull kill selection, set the game state turn to leech
}

function handleSeer(action_obj){
  // please refer to handle heal or kill.
  // not yet implemented
}

function handleLeech(action_src_id, action_obj, event) {
  // 0. anounce every choices that user made to public group
  StateManager.getPlayer(action_src_id).then(function(player){
    var playerId = player._id.$oid;
    var session_id = player.session_id;
    if(player.is_alive) {
      StateManager.getSession(session_id).then(function(session){
        if(session.state != 'leech') {
          replyMessage(event.replyToken, "Maaf kamu hanya bisa menggantung saat sesi menggantung !");
        }else{
          if(!player.voted){
            var victimOrder = action_obj.payload;
            StateManager.findPlayerByOrder(session_id, victimOrder).then(function(victim){
              if(victim.is_alive) {
                StateManager.voteUp(session_id, 'leech', victimOrder).then(function() {
                  StateManager.markPlayerAlreadyVoted(playerId);
                  broadcastVoteLeechMessage(session_id, action_src_id, action_obj, event);
                  // Pindah ke turn werewolf lagi..
                });    
              }else{
                replyMessage(event.replyToken, "Maaf kamu hanya tidak boleh menggantung orang yang sudah mati");
              }
            });
          }else{
            replyMessage(event.replyToken, "Maaf kamu sudah pernah melakukan voting pada periode ini");
          }  
        }
      });
    }else{
      replyMessage(event.replyToken, "Maaf kamu sudah mati.");
    }
  });

  // 1. conver action_obj payload from "order" to lineUserId
  // 2. validate that the command is executed by alive persom
  //  dan yang di gantung adalah orang yang masih hidup.
  // 2. validate that the command is executed while in his turn (must be in the day and within leech session)
  // 3. Majority vote win whom to leech
  // 4. By the end of successfull kill selection, set the game state turn to werewolf session
}

// --- check related ---
function checkCancelGameOrInitGame(actv_code, sessionId) {
  StateManager.findPlayerByActvCode(actv_code)
  .then(function(players){
    var memberSize = players.length;
    // harusnya ada 2 timeout, auto start dan auto cancel, kalau yang auto cancel dieksekusi setiap kali jumlah player kurang darim inimum
    // tapi auto start jalan kalau udah treshold waktu tertentu, kalau cuma autocancel, setiap kali membernya == member minimum, langsung auto start
    // sementara ini sistemnya kaya gitu dulu, dan sementara ini dihardcode dulu, harusnya ada di config.js / constants.js
    // oiya constant.js harusnya make internationalization. (i18n.js)
    if(memberSize >= 6){
      showTime();
      Timeout.clear('timeout_'+sessionId);
      initializeGame(actv_code, sessionId); // trik lain, dua timeout, yang satu by default dia akan initgame setelah durasi tertentu, satu timeout lagi by default cancel game dan direset tiap kali player kurang dari minimum
    }
  });
}

function checkWaitOrAutoKill(session){
  var session_id = session._id.$oid;
  StateManager.countVote(session_id, 'kill').then(function(count){
    StateManager.countRolesAlive(session.group_room_id).then(function(roles){
      var remainingWerewolf = roles.werewolf;
      var votedWolves = count;
      if(count == remainingWerewolf) {

        StateManager.getOrderVoted(session_id, 'kill').then(function(victimOrder){
          broadcastAfterKillMessage(session_id, victimOrder);
        }).catch(function(err){
          StateManager.writeLog('Failed on checkWaitOrAutoKill reason : ' + err.toString());
        });

        console.log('this line is triggered when everyone already voted to kill');
        Timeout.clear('timeout_kill_'+session_id);
        StateManager.setSessionState(session_id, 'heal').then(function(){
          StateManager.resetVoteMark(session_id).then(function(){
            doctorTurn(session_id);
          });
        });
      }
    });
  });
}

function checkWaitOrAutoHeal(session) {
  var session_id = session._id.$oid;
  StateManager.countVote(session_id, 'heal').then(function(count){
    StateManager.countRolesAlive(session.group_room_id).then(function(roles){
      var remainingDoctor = roles.doctor;
      var votedDoctor = count;
      if(count == remainingDoctor) {
        
        StateManager.getOrderVoted(session_id, 'heal').then(function(healedOrder){
          broadcastAfterHealMessage(session_id, healedOrder);
        }).catch(function(err){
          StateManager.writeLog('Failed on cheekwaitorautoheal reason : ' + err.toString);
        });

        console.log("this line is triggered when everyone already voted to heal");
        Timeout.clear('timeout_heal_'+session_id);
        // real perform kill should be put in here.
        // pindah state & decide heal or kill player
        StateManager.setSessionState(session_id, 'leech').then(function(){
          StateManager.resetVoteMark(session_id).then(function() {
            decideHealOrKillPlayer(session_id);
          });
        });
      }
    })
  });
}

function checkWaitOrAutoLeech(session) {
  var session_id = session.id.$oid;
  var roomId = session.group_room_id;
  StateManager.countVote(session_id, 'leech').then(function(count){
    StateManager.findAlive(session.group_room_id).then(function(players){
      var remaining_players = players.length;
      var voted_players = count;
      if(remaining_players == voted_players) {
        StateManager.getOrderVoted(session_id, 'leech').then(function(leechedOrder){
          broadcastAfterLeechMessage(session_id, leechedOrder);
        }).catch(function(err){
          StateManager.writeLog("Failedon checkWaitorAutoLeech function, reason : "+err);
        });
        console.log('this line is triggered when everywone already voted');
        Timeout.clear('timeout_leech_'+session_id);
        
        StateManager.setSessionState(session_id, 'kill').then(function(){
          StateManager.resetVoteMark(session_id).then(function(){
            decideWhomToLeech(session_id,roomId);
          });
        });

      }
    });
  });
}

function checkEndCondition(session_id) {
  return new Promise(function(resolve, reject){
    StateManager.getSession(session_id).then(function(session){
      var roomId = session.group_room_id;
      StateManager.countRolesAlive(roomId).then(function(remaining) {
        StateManager.writeLog('tercatat : ' + JSON.stringify(remaining));
        if(remaining.werewolf >= remaining.villager) {
          resolve('werewolf');
        } else if(remaining.werewolf == 0) {
          resolve('villager');
        } else {
          resolve('notyet');
        }
      })
    });
  });
}

function decideHealOrKillPlayer(session_id) {
  StateManager.getSession(session_id).then(function(session){
    var roomId = session.group_room_id;
    StateManager.getOrderVoted(session_id,'kill').then(function(votedKill){
      StateManager.getOrderVoted(session_id, 'heal').then(function(votedHeal){
        if(votedHeal == votedKill) {
          resetVote(session_id);
          pushMessage(roomId, 'Syukurlah, tadi malam para dokter berhasil menyelamatkan nyawa 1 orang. Tidak ada korban tadi malam');
          // Harusnya ini transisis stae gak cuma leech turn, tapi juga reset vote, dan setSessisonState biar jadi leech -- checked ternyata udah diwrap oleh fungsi ini
          leechTurn(session_id);
        }else{ 
          performKillPlayer(session_id, function(){
            checkEndCondition(session_id).then(function(winner){
              console.log(winner);
              if(winner == 'werewolf'){
                StateManager.setSessionState(session_id, 'finished_wolf').then(function(){
                  pushMessage(roomId, 'Werewolf menang, jumlah werewolf = jumlah pemain !');
                });
              }else if(winner == 'villager'){
                StateManager.setSessionState(session_id, 'finished_villager').then(function(){
                  pushMessage(roomId, 'Warga desa menang, jumlah werewolf = 0 !');
                });
              }else{
                StateManager.findPlayerByOrder(session_id, votedKill).then(function(victim){
                  pushMessage(roomId, 'Tadi malam, ada satu korban yang mati, dia adalah ' + victim.display_name);
                  // Harusnya ini transisis stae gak cuma leech turn, tapi juga reset vote, dan setSessisonState biar jadi leech
                  leechTurn(session_id);
                });
              }
            });
          });
        }
      }).catch(function(err){
        // Harusnya ini transisis stae gak cuma leech turn, tapi juga reset vote, dan setSessisonState biar jadi leech
        performKillPlayer(session_id, function(){
          checkEndCondition(session_id).then(function(winner){
            console.log(winner);
            if(winner == 'werewolf'){
              StateManager.setSessionState(session_id, 'finished_wolf').then(function(){
                pushMessage(roomId, 'Werewolf menang, jumlah werewolf = jumlah pemain !');
              });
            }else if(winner == 'villager'){
              StateManager.setSessionState(session_id, 'finished_villager').then(function(){
                pushMessage(roomId, 'Warga desa menang, jumlah werewolf = 0 !');
              });
            }else{
              StateManager.findPlayerByOrder(session_id, votedKill).then(function(victim){
                pushMessage(roomId, 'Tadi malam, ada satu korban yang mati, dia adalah ' + victim.display_name);
                // Harusnya ini transisis stae gak cuma leech turn, tapi juga reset vote, dan setSessisonState biar jadi leech
                leechTurn(session_id);
              });
            }
          });
        });
        StateManager.writeLog('Failed on decideHealOrKillPlayer reason : ' + err.toString());
      });
    }).catch(function(err){
      // Harusnya ini transisis stae gak cuma leech turn, tapi juga reset vote, dan setSessisonState biar jadi leech
      leechTurn(session_id);
      StateManager.writeLog('Failed on decideHealOrKillPlayer reason : ' + err.toString());
    });
  });
}

function decideWhomToLeech(session_id, roomId) {
  performLeechPlayer(session_id, function(){
    checkEndCondition(session_id).then(function(winner){
      console.log(winner);
      if(winner == 'werewolf') {
        StateManager.setSessionState(session_id, 'finished_wolf').then(function(){
          pushMessage(roomId, 'Game bearkhir, werewolf menang karena jumlah werewolf = jumlah villager');
        })
      }else if(winner == 'villager') {
        StateManager.setSessionState(session_id, 'finished_villager').then(function(){
          pushMessage(roomId, 'Game bearkhir, warga desa menang karena werewolf sudah mati semuanya');
        });
      }else if(winner == 'notyet') {
        werewolfTurn(session_id);
      }
    });
  });
}

function performLeechPlayer(session_id, callback) {
  StateManager.getOrderVoted(session_id, 'leech').then(function(leeched){
    StateManager.setPlayerLiveStatusByOrder(session_id, leeched, false).then(function() {
      StateManager.clearVote(session_id, 'leech').then(function(){
        callback();
      });
    });
  }).catch(function(err){
    StateManager.writeLog("error on function perform Leech Player reason : " +err.toString());
    werewolfTurn(session_id);
  }) ;
}

function performKillPlayer(session_id, callback) {
  StateManager.getOrderVoted(session_id, 'kill').then(function(voted){
    // kill someone.. after doctor failed to heal
    StateManager.setPlayerLiveStatusByOrder(session_id, voted, false).then(function(){
      resetVote(session_id);
      callback();
      // send message whom is killed
      // set the turn to doctor, (setState but after someone being killed)
      
    });
  }).catch(function(err){
    StateManager.writeLog("error on function perform Kill Player reason : " +err.toString());
    doctorTurn(session_id);
  });
}

function resetVote(session_id){
  StateManager.clearVote(session_id, 'kill');
  StateManager.clearVote(session_id, 'heal');
}

function initializeGame(actv_code, sessionId) {
  // Harusnya disini ditambahin lagi, untuk nge-set order biar gak ada race condition jadi tanggung jawab join game purely cuma nambahin
  // yang nge-assign order setelah di-init game
  StateManager.findPlayerByActvCode(actv_code)
  .then(function(players){
    var memberSize = players.length;
    var playerComposition = getPlayerComposition(memberSize);
    var numOfSpecialCharacters = getTotalRoleCount(playerComposition);

    StateManager.setDefaultRoleByActvCode(actv_code)
    .then(function(){  
      var specialCharacters = pickRandomNFromArray(numOfSpecialCharacters, players);
      var listOfSpecialCharacters = generateListOfSpecialCharacters(playerComposition);
      var promises = setSpecialCharacterRoles(specialCharacters, listOfSpecialCharacters);
      console.log("game initialized, role changed");
      // kirim message ke masing-masing player role yang mereka miliki
      Promise.all(promises).then(function(){
        informRoleToUser(sessionId);
      });
      // set game state to "werewolf turn"
      // send messsage to room that current game is in the night
      // send a message to every werewolf that he should pick someone to be killed
      // broadcast a message to each werewolf everytime a werewolf pick someone, (they must agree with a person or, the system will pick a random person from a subset they suggest)
      StateManager.setSessionState(sessionId, 'kill').then(function(){
        StateManager.resetVoteMark(sessionId).then(function(){
          werewolfTurn(sessionId);
        });
      });
      // .catch(function(err){
      //   StateManager.writeLog('error on initializing game, can not set session state to kill reason :'+ err.toString);    
      // })
    });
  }).catch(function(err){
    StateManager.writeLog('error on initializing game :'+ err.toString);
  });
}

function informRoleToUser(sessionId) {
  StateManager.findPlayerBySessionId(sessionId)
  .then(function(players){
    for (var i = 0; i < players.length; i++) {
      var player = players[i];
      pushMessage(player.member_id,'Peran kamu adalah : ' + player.role);
    }
  });
}

function setSpecialCharacterRoles(players, listOfSpecialCharacters) {
  var promises = [];
  for (var i in listOfSpecialCharacters) {
    // alter the db state
    var selectedCharacter = listOfSpecialCharacters[i];
    var selectedPlayerId = players[i].member_id;
    var promise = StateManager.setRole(selectedPlayerId, selectedCharacter);
    promises.push(promise);
  }
  return promises;
}

function getPlayerComposition(memberSize) {
  var defaultComposition = {
    'werewolf': 2,
    'doctor': 1
  };
  // sementara ini dihardcode dulu, better ada sedikit random factor
  switch(memberSize) {
    case 8 : 
      return {
        'werewolf': 2,
        'doctor': 1
      }
    // other number of player  are not supported yet..
  }
  
  return defaultComposition;
}

function getTotalRoleCount(playerComposition) {
  var numOfSpecialCharacters = 0;
  for (var key in playerComposition) {
    if(playerComposition.hasOwnProperty(key)) {
      numOfSpecialCharacters = numOfSpecialCharacters + playerComposition[key];
    }
  }
  return numOfSpecialCharacters;
}

function generateListOfSpecialCharacters(playerComposition) {
  var specialCharacters = [];
  for (var role in playerComposition) {
    if(playerComposition.hasOwnProperty(role)) {
      numOfRole = playerComposition[role];
      for (var i = 0; i < numOfRole; i++) {
       specialCharacters.push(role);
      }
    }
  }
  return specialCharacters;
}


// --- Turn related --- 

function werewolfTurn(sessionId) {
  // set game state to "werewolf turn"
  // send messsage to room that current game is in the night
  StateManager.getSession(sessionId).then(function(session){
    var roomId = session.group_room_id;
    pushMessage(roomId, 'Saat ini sedang malam, para serigala sedang berburu mangsa. Bagi yang merasa serigala, silahkan cek chat pribadi dengan bot ini');
    pushMessage(roomId, 'Malam pun datang, para werewolf berburu mangsa. Bagi yang merasa werewolf dan masih hidup, silahkan cek chat pribadi dengan bot ini.');
  });
  // send a message to every werewolf that he should pick someone to be killed
  // \n Kamu hanya bisa membunuh player yg masih hidup \n Waktumu 1 menit dari sekarang
  StateManager.findPlayerWithRoleBySessionId(sessionId, 'werewolf')
  .then(function(players){
    generatePlayerChoices(sessionId, true)
    .then(function(message){
      for (var i = 0; i < players.length; i++) {
        var playerId = players[i].member_id;
        pushMessage(playerId, message);
        // harusnya divalidasi orang yang dipilih benar benar yang hidup, bukan orang mati (seakrang belum divalidasi)
        pushMessage(playerId, '\n Kamu hanya bisa membunuh player yg masih hidup dengan perintah kill <spasi> nomor player \n Waktumu 1 menit dari sekarang');
      }
    });
    var durasi_vote_kill = 1000 * 60 ;
    console.log("setting up a timeout to automatically move to doctor turn on ");
    showTime();
    Timeout.set('timeout_kill_'+sessionId, function() {
      // Auto transition ke state heal. sementara ini dulu 
      console.log("this line is auto triggered even when no one vote")
      // performKillPlayer(sessionId);
      StateManager.setSessionState(sessionId, 'heal').then(function(){
        StateManager.resetVoteMark(sessionId).then(function(){
          doctorTurn(sessionId);
        });
      });
      console.log("supposed to change the state into heal ");
    }, durasi_vote_kill);
  });
}

function doctorTurn(sessionId) {
  StateManager.getSession(sessionId).then(function(session){
    var roomId = session.group_room_id;
    pushMessage(roomId, 'Malam masih berlangsung, para dokter bertugas menyembuhkan yang sakit. Bagi yang merasa menjadi dokter silahkan cek chat dengan bot ini');
  });
  StateManager.findPlayerWithRoleBySessionId(sessionId, 'doctor')
  .then(function(players){
    generatePlayerChoices(sessionId, true)
    .then(function(message){
      for (var i = 0; i < players.length; i++) {
        var playerId = players[i].member_id;
        pushMessage(playerId, message);
        // harusnya divalidasi orang yang dipilih benar benar yang hidup, bukan orang mati (seakrang belum divalidasi)
        pushMessage(playerId, '\n Silahkan pilih orang yang ingin kamu sembuhkan, gunakan perintah heal <spasi> nomor urut.');
      }
    });

    console.log("setting up a timeout to automatically move to leech turn on ");
    showTime();
    // Kasih timeout untuk heal
    var durasi_vote_heal = 1000 * 60 ;
    Timeout.set('timeout_heal_'+sessionId, function(){
      console.log("this line is automatically executed after time pass for doctor session");
      StateManager.setSessionState(sessionId, 'leech').then(function(){
        StateManager.resetVoteMark(sessionId).then(function(){
          decideHealOrKillPlayer(sessionId); 
        });
      });
    }, durasi_vote_heal);
  });
}

function leechTurn(session_id) {
  StateManager.getSession(session_id).then(function(session){
    console.log("harusnya cek apakah werewolf menang dengan membunuh warga desa ini.. (jumlah remaining werewolf == jumlah warga desa)");

    var roomId = session.group_room_id;
    pushMessage(roomId, 'Ayam berkokok, pagi ini warga desa memutuskan untuk menggantung satu orang yang dicurigai sebagai siluman serigala -  GGS (ganteng-ganteng serigala). \n Bagi yang masih hihdup Silahkan cek chat pribadi dengan bot ini untuk melakukan voting siapa yang ingin digantung. Kamu punya waktu 2 menit untuk berdiskusi');
    generatePlayerChoices(session_id, true).then(function(optionsMessage){
      StateManager.findAlive(roomId).then(function(players){
        for (var i = 0; i < players.length; i++) {
          var playerId = players[i].member_id;
          optionsMessage = optionsMessage + '\n\n Silahkan vote siapa yang ingin digantung dengan perintah leech <spasi> nomor urut, kamu hanya bisa melakukan voting 1 kali';
          pushMessage(playerId, optionsMessage);
        }
      });
    });

    var durasi_vote_leech = 1000 * 60 * 2;
    Timeout.set('timeout_leech_'+session_id, function() {
      console.log("harusnya cek apakah warga desa menang (remaining werewolf = 0)");
      StateManager.setSessionState(session_id, 'kill').then(function(){
        StateManager.resetVoteMark(session_id).then(function(){
          decideWhomToLeech(session_id, roomId);
        });
      });
    }, durasi_vote_leech);
  });
}

function generatePlayerChoices(sessionId, showStatus) {
  return new Promise(function(resolve, reject){
    StateManager.findPlayerBySessionId(sessionId)
    .then(function(players){
      // sort by order first
      var sortedPlayers = players.sort(function(x, y){
        return x.order - y.order;
      });
      var message = 'Silahkan pilih salah satu dari player di bawah ini :\n';

      for (var i = 0; i < sortedPlayers.length; i++) {
        var player = sortedPlayers[i];
        var playerOrder = player.order;
        var playerDisplayName = player.display_name;
        var playerStatus = player.is_alive;
        message = message + playerOrder + '. ' + playerDisplayName + ' ';
        // better to use emoji .. sementara ini make text biasa dulu aja.
        if(showStatus){
          if(playerStatus) {
            message = message + 'alive' + '\n'
          }else{
            message = message + 'dead' + '\n'
          }
        }
      }

      var endNotes = 'catatan: \n Player yang dipilih adalah player yang divote paling banyak. Jika tidak ada player yang divote terbanyak, maka sistem akan memilih secara acak dari player-player yang dipilih'
      message = message + endNotes;

      resolve(message);
    }).catch(function(err){
      StateManager.writeLog('error at generateWerewolfChoiceMessage function '+ err.toString());
      resolve('Some error happens, please report it to fawwaz muhammad');
    });
  });
}

//  ---- Kill Related  ---- 
function broadcastVoteKillMessage(sessionId, action_src_id, action_obj, event) {
  // get profile dari yang ngekill,
  StateManager.findPlayerWithRoleBySessionId(sessionId, 'werewolf').then(function(players){
    var playerOrder = action_obj.payload;
    generateVoteKillMessage(action_src_id, sessionId, playerOrder).then(function(message){
      for (var i = 0; i < players.length; i++) {
        var playerId = players[i].member_id;
        pushMessage(playerId, message);
      }
    });
  });
}

function generateVoteKillMessage(userId, sessionId, order) {
  return new Promise(function(resolve, reject){
    getProfile(userId).then(function(user){
      var killerDisplayName = user.displayName;
      StateManager.findPlayerByOrder(sessionId, order).then(function(killed){
        var killedDisplayName = killed.display_name;
        resolve(killerDisplayName + ' telah me-vote untuk membunuh ' + killedDisplayName);
      });
    });
  });
  // should return : X telah mem-vote to kill Y
}

function broadcastAfterKillMessage(session_id, order) {
  StateManager.findPlayerWithRoleBySessionId(session_id, 'werewolf').then(function(players){
    StateManager.findPlayerByOrder(session_id, order).then(function(killed){
      for (var i = 0; i < players.length; i++) {
        var playerId = players[i].member_id;
        var killedName = killed.display_name;
        pushMessage(playerId, killedName + ' has been killed');
      }
    });
  });
}

// --- Heal related ---
function broadcastVoteHealMessage(session_id, action_src_id, action_obj, event){
  StateManager.findPlayerWithRoleBySessionId(session_id, 'doctor').then(function(healers){
    var playerOrder = action_obj.payload;
    generateVoteHealMessage(action_src_id, session_id, playerOrder).then(function(message){
      for (var i = 0; i < healers.length; i++) {
        var healerId = healers[i].member_id;
        pushMessage(healerId, message);
      }
    })
  });
}

function broadcastAfterHealMessage(session_id, order) {
  StateManager.findPlayerWithRoleBySessionId(session_id, 'doctor').then(function(players){
    StateManager.findPlayerByOrder(session_id, order).then(function(healed){
      for (var i = 0; i < players.length; i++) {
        var playerId = players[i].member_id;
        var healedName = healed.display_name;
        pushMessage(playerId, healedName + ' telah disembuhkan');
      }
    });
  });
}

function generateVoteHealMessage(userId, sessionId, order){
  return new Promise(function(resolve, reject){
    getProfile(userId).then(function(healer){
      var healerDisplayname = healer.displayName;
      StateManager.findPlayerByOrder(sessionId, order).then(function(healed){
        var healedDisplayName = healed.display_name;
        resolve(healerDisplayname + ' telah me-vote untuk meng-heal ' + healedDisplayName);
      });
    })
  });
}

// --- leech related ---
function broadcastVoteLeechMessage(session_id, action_src_id, action_obj, event) {
  StateManager.getSession(session_id).then(function(session){
    var roomId = session.group_room_id;
    var playerOrder = action_obj.payload;
    StateManager.findPlayerByOrder(session_id, playerOrder).then(function(voted){
      var votedId = voted.member_id;
      var voterId = action_src_id;
      getProfile(voterId).then(function(thevoter){
        getProfile(votedId).then(function(thevoted){
          var thevotername = thevoter.displayName;
          var thevotedname = thevoted.displayName;

          pushMessage(roomId, thevotername + 'telah memilih untuk menggantung ' + thevotedname);
        });
      });
    });
  });
}

function broadcastAfterLeechMessage(session_id, order){
  StateManager.getSession(session_id).then(function(session){
    var roomId = session.group_room_id;
    StateManager.findPlayerByOrder(session_id, order).then(function(leeched){
      var leeched_display_name = leeched.display_name;
      var leeched_role = leeched.role;
      pushMessage(roomId, 'Setelah melalui musyawarah, warga desa memilih untuk menggantung ' + leeched_display_name + ' di alun-alun desa. Ternyata dia adalah : ' + leeched_role);
    });
  });
}
/**
 * 
 * HELPER FUNCTION
 * 
 */

function pad(n, width, z) {
  z = z || '0';
  n = n + '';
  return n.length >= width ? n : new Array(width - n.length + 1).join(z) + n;
}

function randomize(minimum, maximum) {
  return Math.floor(Math.random() * (maximum - minimum + 1)) + minimum;
}

function shuffle(array) {
  var currentIndex = array.length, temporaryValue, randomIndex;

  // While there remain elements to shuffle...
  while (0 !== currentIndex) {

    // Pick a remaining element...
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex -= 1;

    // And swap it with the current element.
    temporaryValue = array[currentIndex];
    array[currentIndex] = array[randomIndex];
    array[randomIndex] = temporaryValue;
  }

  return array;
}

function pickRandomNFromArray(n, array) {
  return shuffle(array).slice(0, n);
}

function showTime(){
    var options = {
        timeZone: 'Asia/Jakarta',
        year: 'numeric', month: 'numeric', day: 'numeric',
        hour: 'numeric', minute: 'numeric', second: 'numeric',
    },
    formatter = new Intl.DateTimeFormat([], options);
    console.log(formatter.format(new Date()));
}


module.exports = {
  'setClient': setClient,
  'replyMessage': replyMessage,
  'pushMessage': pushMessage,
  'getProfile': getProfile,
  'decideAction': decideAction,
};