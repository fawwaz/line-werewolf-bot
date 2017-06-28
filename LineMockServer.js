var express = require('express');
var bodyParser = require('body-parser');
var app = express();

app.use(bodyParser.json());

app.get('/', function(req, res){
    res.send('Hello world');
});

app.post('/message/reply',function(req, res){
    console.dir(req.body);
    res.json(req.body);
});

app.post('/message/push', function(req, res){
    console.dir(req.body);
    res.json(req.body);
});

app.get('/profile/:userId', function(req, res){
    var users = {
        'member_1':{
            'displayName': 'Spongebob',
            'userId': 'member_1',
            'pictureUrl': 'http://placeholder.it/256x256',
            'statusMessage': 'exampleStatusMessage',
        },
        'member_2':{
            'displayName': 'Patrick Star',
            'userId': 'member_2',
            'pictureUrl': 'http://placeholder.it/256x256',
            'statusMessage': 'exampleStatusMessage',
        },
        'member_3':{
            'displayName': 'Sandy Squirrel',
            'userId': 'member_3',
            'pictureUrl': 'http://placeholder.it/256x256',
            'statusMessage': 'exampleStatusMessage',
        },
        'member_4':{
            'displayName': 'Mr. Crab',
            'userId': 'member_4',
            'pictureUrl': 'http://placeholder.it/256x256',
            'statusMessage': 'exampleStatusMessage',
        },
        'member_5':{
            'displayName': 'Plankton',
            'userId': 'member_5',
            'pictureUrl': 'http://placeholder.it/256x256',
            'statusMessage': 'exampleStatusMessage',
        },
        'member_6':{
            'displayName': 'Larry Lobster',
            'userId': 'member_6',
            'pictureUrl': 'http://placeholder.it/256x256',
            'statusMessage': 'exampleStatusMessage',
        },
        'member_7':{
            'displayName': 'SquidWard Tentacle',
            'userId': 'member_7',
            'pictureUrl': 'http://placeholder.it/256x256',
            'statusMessage': 'exampleStatusMessage',
        },
    };

    var selectedUser = users[req.params.userId];
    console.dir(selectedUser);
    res.json(selectedUser);
});

app.post('*', function(req, res){
    console.dir(req.body);
    res.json(req.body);
});

app.listen(8000, function(){
    console.log("listening on port 8000");
});