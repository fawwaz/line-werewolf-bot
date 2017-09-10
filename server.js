var express = require('express');
var bodyParser = require('body-parser');
var line = require('@line/bot-sdk');
var myconfig = require('./config.js');
var Promise = require('bluebird');
var dialogManager = require('./dialogManager.js')

var app = express();

var config = {
    channelAccessToken: myconfig.LINE_CHANNEL_ACCESS_TOKEN,
    channelSecret: myconfig.LINE_CHANNEL_SECRET
}
const client = new line.Client(config);
dialogManager.setClient(client);

console.dir("manager from root", dialogManager);
app.use(line.middleware(config));
app.use(bodyParser.json());

app.post('/webhook', function(req, res){
  console.log(req.body);
  Promise
    .all(req.body.events.map(dialogManager.decideAction))
    .then(function(result){
        return res.json(result);
    });
});


function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') {
    return Promise.resolve(null);
  }

  return client.replyMessage(event.replyToken, {
    type: 'text',
    text: event.message.text
  });
}

app.listen(3000, function(){
  console.log("server running on port 3000");
});