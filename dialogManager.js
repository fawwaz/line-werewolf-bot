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
        console.log(action_obj);
        return replyMessage(event.replyToken, JSON.stringify(action_obj)); 
      }else if (action_type == "leech") {
        return handleKill(action_src_id, action_obj, event);
      }else if (action_type == "kill") {
        console.log(action_obj);
        return replyMessage(event.replyToken, JSON.stringify(action_obj)); 
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
            resetTimeoutOrInitializeGame(actv_code, sessionId);
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
  // 1. convert action_obj payload from "order" to lineUserId - no need
  // 2. validate that the lineUserId role (must be a werewolf)
  StateManager.getPlayer(action_src_id).then(function(player){
    if(player.role == 'werewolf') {
      var session_id = player.session_id;
      StateManager.getSession(session_id).then(function(session){
        if(session.state != 'kill'){
          replyMessage(event.replyToken, 'Kamu hanya bisa membunuh saat giliran kamu (malam hari)');
        }else{
          // vote up dan broadcast message
        }
      });
    }else{
      replyMessage(event.replyToken, 'Maaf kamu bukan serigala');
    }
  }).catch(function(err){
    StateManager.writeLog("Error in handleKill function, "+ err);
    replyMessage(event.replyToken, 'An error occured in handleKill function, please report it to fawwaz muhammad');
  })
  // 3. validate that the command is executed while in his turn (must be in the night and within werewolf session)
  // 4. If there is more than 1 werewolf , all werewolf must agree whom to kill (put a brodcast message for every wereowlf who is choosing whom)
  // 5. By the end of successfull kill selection, set the game state turn to doctor
}

function handleHeal(action_obj){
  // 1. convert action_obj payload from "order" to lineUserId
  // 2. validate that the lineUserId role (must be a doctor)
  // 3. validate that the command is executed while in his turn (must be in the night and within doctor session)
  // 4. If there is more than 1 doctor , all doctor must agree whom to heal (put a brodcast message for every doctor who is choosing whom)
  // 5. By the end of successfull kill selection, set the game state turn to leech
}

function handleSeer(action_obj){
  // please refer to handle heal or kill.
}

function handleLeech(action_obj) {
  // 0. anounce the incident (whether someone get killed or doctor successful to heal someone)
  // 1. conver action_obj payload from "order" to lineUserId
  // 2. validate that the command is executed while in his turn (must be in the day and within leech session)
  // 3. Majority vote win whom to leech
  // 4. By the end of successfull kill selection, set the game state turn to werewolf session
}

function resetTimeoutOrInitializeGame(actv_code, sessionId) {
  StateManager.findPlayerByActvCode(actv_code)
  .then(function(players){
    var memberSize = players.length;
    // harusnya ada 2 timeout, auto start dan auto cancel, kalau yang auto cancel dieksekusi setiap kali jumlah player kurang darim inimum
    // tapi auto start jalan kalau udah treshold waktu tertentu, kalau cuma autocancel, setiap kali membernya == member minimum, langsung auto start
    // sementara ini sistemnya kaya gitu dulu, dan sementara ini dihardcode dulu, harusnya ada di config.js / constants.js
    // oiya constant.js harusnya make internationalization. (i18n.js)
    if(memberSize >= 7){
      Timeout.clear('timeout_'+sessionId);
      initializeGame(actv_code, sessionId); // trik lain, dua timeout, yang satu by default dia akan initgame setelah durasi tertentu, satu timeout lagi by default cancel game dan direset tiap kali player kurang dari minimum
    }
  });
}

function initializeGame(actv_code, sessionId) {
  StateManager.findPlayerByActvCode(actv_code)
  .then(function(players){
    var memberSize = players.length;
    var playerComposition = getPlayerComposition(memberSize);
    var numOfSpecialCharacters = getTotalSpecialCharacter(playerComposition);

    StateManager.setDefaultRoleByActvCode(actv_code)
    .then(function(){  
      var specialCharacters = pickRandomNFromArray(numOfSpecialCharacters, players);
      var listOfSpecialCharacters = generateListOfSpecialCharacters(playerComposition);
      setSpecialCharacterRoles(specialCharacters, listOfSpecialCharacters);
      console.log("game initialized, role changed");
      // kirim message ke masing-masing player role yang mereka miliki
      informRoleToUser(sessionId)
      // set game state to "werewolf turn"
      // send messsage to room that current game is in the night
      // send a message to every werewolf that he should pick someone to be killed
      // broadcast a message to each werewolf everytime a werewolf pick someone, (they must agree with a person or, the system will pick a random person from a subset they suggest)
      werewolfTurn(sessionId);
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
  for (var i in listOfSpecialCharacters) {
    // alter the db state
    var selectedCharacter = listOfSpecialCharacters[i];
    var selectedPlayerId = players[i].member_id;
    StateManager.setRole(selectedPlayerId, selectedCharacter);
  }
}

function getPlayerComposition(memberSize) {
  var defaultComposition = {
    'werewolf': 2,
    'seer': 1
  };
  // sementara ini dihardcode dulu, better ada sedikit random factor
  switch(memberSize) {
    case 8 : 
      return {
        'werewolf': 2,
        'seer': 1
      }
    // other number of player  are not supported yet..
  }
  
  return defaultComposition;
}

function getTotalSpecialCharacter(playerComposition) {
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

function werewolfTurn(sessionId) {
  // set game state to "werewolf turn"
  // send messsage to room that current game is in the night
  pushMessage(sessionId, 'Saat ini sedang malam, para serigala sedang berburu mangsa. Bagi yang merasa serigala, silahkan cek chat pribadi dengan bot ini');
  pushMessage(sessionId, 'Malam pun datang, para werewolf berburu mangsa. Bagi yang merasa werewolf dan masih hidup, silahkan cek chat pribadi dengan bot ini.');
  // send a message to every werewolf that he should pick someone to be killed
  // \n Kamu hanya bisa membunuh player yg masih hidup \n Waktumu 1 menit dari sekarang
  StateManager.findPlayerWithRoleBySessionId(sessionId, 'werewolf')
  .then(function(players){
    generatePlayerChoices(sessionId)
    .then(function(message){
      for (var i = 0; i < players.length; i++) {
        var playerId = players[i].member_id;
        pushMessage(playerId, message);
        pushMessage(playerId, '\n Kamu hanya bisa membunuh player yg masih hidup dengan perintah kill <spasi> nomor player \n Waktumu 1 menit dari sekarang');
      }
    })
  });
}

function generatePlayerChoices(sessionId) {
  console.log("session id to generate" + sessionId);
  return new Promise(function(resolve, reject){
    StateManager.findPlayerBySessionId(sessionId)
    .then(function(players){
      // sort by order first
      console.log(players);
      var sortedPlayers = players.sort(function(x, y){
        return x.order - y.order;
      });
      var message = 'Silahkan pilih salah satu dari player di bawah ini :\n';

      for (var i = 0; i < sortedPlayers.length; i++) {
        var player = sortedPlayers[i];
        console.log("player urutan ke :"+i);
        console.log(player);
        var playerOrder = player.order;
        var playerDisplayName = player.display_name;
        var playerStatus = player.is_alive;
        message = message + playerOrder + '. ' + playerDisplayName + ' ';
        // better to use emoji .. sementara ini make text biasa dulu aja.
        if(playerStatus) {
          message = message + 'alive' + '\n'
        }else{
          message = message + 'dead' + '\n'
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


module.exports = {
  'setClient': setClient,
  'replyMessage': replyMessage,
  'pushMessage': pushMessage,
  'getProfile': getProfile,
  'decideAction': decideAction,
};