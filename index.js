require('dotenv').config({path: __dirname + '/.env'});
const express = require('express');
const bodyParser = require('body-parser');
const request = require('request');
const MongoClient = require('mongodb').MongoClient;
const { GoogleSpreadsheet } = require('google-spreadsheet');
const SPREADSHEET = new GoogleSpreadsheet('1Ker_8CBQI5hog9QO8QrtHWkFQiq3lGEHra5_SteLGcQ'); 

SPREADSHEET.useServiceAccountAuth(require('./queuemanager-jrtl-2551cac54f86.json'));

var app = express();
app.use(bodyParser.json());

function chatApiSendMessage(phone, message){
    var options = {
        method: 'POST',
        url:`https://${process.env['BACKEND_API_SERVER']}.chat-api.com/instance${process.env['BACKEND_INSTANCEID']}/sendMessage?token=${process.env['BACKEND_CHATAPI_TOKEN']}`,
        body:{
            "phone":phone,
            "body":message
        },
        json: true
    };

    return new Promise(function(resolve, reject) {
		request(options, (error, response, body) => {
			if (error) {
				console.log(error);
				reject(error)
			} else {
				console.log(body);
				resolve(body)
			}
		});
	})
}


function delay(t, v) {
    return new Promise(function(resolve) {
        setTimeout(resolve.bind(null, v), t)
    });
 }

 async function loadSpreadsheet(sheetName) {
    await SPREADSHEET.loadInfo();
    const sheet = SPREADSHEET.sheetsByTitle[sheetName]
    const rows = await sheet.getRows()
    return rows
}


async function loadContentSheet(){
    let content = {};
    let rows = await loadSpreadsheet('content')
    for (let index = 0; index < rows.length; index++) {
        if(!content.hasOwnProperty(rows[index]['message'])){
            content[rows[index]['message']] = []
        }
        content[rows[index]['message']]
        }
    return content
}

async function loadContactSheet() { 
    let content = {};
    let rows = await loadSpreadsheet('receiver_detail')
    for (let index = 0; index < rows.length; index++) {
        if(!content.hasOwnProperty( rows[index]['new_phone'] )) {
            content[rows[index]['new_phone']] = []
        }
        content[rows[index]['new_phone']]        
    }
    console.log(content)
    return content
}

var database;
//connect to the MongoDB database
MongoClient.connect(`${process.env['CONNECTION_URL']}`, { useNewUrlParser: true, useUnifiedTopology: true }, (error, client) => {
	if (error){
		console.log(error);
		throw new Error(error);
	}
	else {
		console.log(`${process.env['DATABASE_NAME']} connected!`);
		database = client.db(`${process.env['DATABASE_NAME']}`);
	}
	client.close();
});



let settings = {};
app.post('/sendMessage', async (req, res) => {

    let content = await loadContentSheet()
    let contact = await loadContactSheet()
    let settingRows = await loadSpreadsheet('content')
    for(let rows=0; rows<settingRows.length; rows++) {
        settings[settingRows[rows]["key"]]= {
            "welcome": settingRows[rows]["welcome"],
            "thanks": settingRows[rows]["thanks"],
            "error": settingRows[rows]["error"]
        }
    }
    res.send("OK").status(200)
    for(let code in contact) {
        for(let number =0 ; number < contact[code].length; number++) {
            if(content.hasOwnProperty(code) ) {
                let filterObj = { phoneNumber: contact[code][number] }
                let changes = {
                    $set: {
                        code: code,
                        questions: content[code],
                        currentQuestionAsked: content[code][0]["Number"]
                    }
                }
                database.collection("userDetails").updateOne(filterObj,changes , { upsert: true }, function(err, result) {
                    if (err) {
                        console.log(err)
                    } else {
                        console.log("document updated")
                    }
                });
                const firstQuestion = content[code][0]
                chatApiSendMessage(contact[code][number], settings[code]['welcome'])
                .then((result) => {
                }).catch((error) => {
                })
                await delay(5000)
                chatApiSendMessage(contact[code][number], firstQuestion['Message'])
                .then((result) => {
                }).catch((error) => {
                })
                await delay(60000)
            }
        }
    }
})



app.listen(process.env.PORT || 4000,() => {
	console.log(`Server started on port 4000...`);
});
