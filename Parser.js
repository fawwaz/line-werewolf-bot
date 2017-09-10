var peg = require('pegjs');
var fs = require('fs');


function parse(sentence){
    var grammar = fs.readFileSync('./grammar.txt','utf8');
    var parser = peg.generate(grammar);
    return parser.parse(sentence);
}

var parser = module.exports = {
    parse : function(sentence){
        return parse(sentence);
    }
}