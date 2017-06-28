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
        console.log(action_obj);
        return replyMessage(event.replyToken, JSON.stringify(action_obj)); 
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
    // Nyoba timeout
    var durasi = 1000 * 60 * 1;
    Timeout.set('timeout_'+roomId, function(){ 
      console.log('timeout tereksekusi untuk room : '+ roomId);
    },durasi);


    StateManager.createSession(roomId, activation_code).then(function(session){
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
    var roomId = session.group_room_id;
    Timeout.clear('timeout_'+roomId);

    if(session.state != 'INITIAL') {
     return replyMessage(event, 'Kamu hanya bisa bergabung saat game belum berlangsung. Tunggu hingga ada game sesi baru');
    }else{
      StateManager.getPlayer(userId).then(function(player){
        // then the player already registered
        return replyMessage(event, 'Kamu sudah pernah bergabung dalam sesi ini');
      }).catch(function(err){
        getProfile(userId).then(function(user){
          var displayName = user.displayName;
          return StateManager.joinSession(userId,displayName, actv_code).then(function(succ){
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

function handleKill(action_obj){
  // 1. convert action_obj payload from "order" to lineUserId
  // 2. validate that the lineUserId role (must be a werewolf)
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

function initializeGame() {
  
}

function getPlayerComposition() {
  // sementara ini dihardcode dulu
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


module.exports = {
  'setClient': setClient,
  'replyMessage': replyMessage,
  'pushMessage': pushMessage,
  'getProfile': getProfile,
  'decideAction': decideAction,
};