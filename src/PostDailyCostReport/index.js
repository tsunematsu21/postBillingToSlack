const AWS            = require('aws-sdk');
const documentClient = new AWS.DynamoDB.DocumentClient({ region: process.env.DYNAMO_DB_REGION });
const https          = require('https');
const url            = require('url');
const Decimal        = require('./node_modules/decimal.js');

exports.handler = (event, context, callback) => {
  const beginningOfMonth = new Date(new Date(new Date().setHours(0, 0, 0, 0)).setDate(1));
  const today            = new Date(new Date().setHours(0, 0, 0, 0));
  
  const startTime = `${beginningOfMonth.getFullYear()}-${('0'+ (beginningOfMonth.getMonth() + 1)).slice(-2)}-${('0'+ beginningOfMonth.getDate()).slice(-2)}`;
  const endTime   = `${today.getFullYear()}-${('0'+ (today.getMonth() + 1)).slice(-2)}-${('0'+ today.getDate()).slice(-2)}`;
  
  const slack_req_opts   = url.parse(process.env.SLACK_WEBHOOK_URL);
  slack_req_opts.method  = 'POST';
  slack_req_opts.headers = {'Content-Type': 'application/json'};
  
  let billings = {};
  let total    = new Decimal(0);
  
  let params = {
    TableName: process.env.TABLE_NAME,
    IndexName: process.env.INDEX_NAME,
    KeyConditionExpression: '#key = :value',
    ExpressionAttributeNames : {
      "#key"  : 'timestamp'
    },
    ExpressionAttributeValues: {
      ':value': ''
    }
  };
  
  let queries = [];
  
  for (let day of Array.from({length: today.getDate() - 1}, (v, k) => k)) {
    let timestamp = new Date(beginningOfMonth.getTime()).setDate(beginningOfMonth.getDate() + day) / 1000;
    
    params.ExpressionAttributeValues[':value'] = timestamp;
    console.log(params);
    
    queries.push(query(params));
  }
  
  Promise.all(queries).then((datas) => {
    for (let data of datas) {
      for (let item of data.Items) {
        total = total.plus(new Decimal(item.cost));
        if (!billings[item.region]) billings[item.region] = {};
        if (!billings[item.region][item.service]) billings[item.region][item.service] = new Decimal(0);
        billings[item.region][item.service] = billings[item.region][item.service].plus(new Decimal(item.cost));
      }
    }

    let text = `*AWS Daily Cost Report* (${startTime} - ${endTime})`;

    let attachments = Object.keys(billings).sort((a, b) => {
      if (a == 'NoRegion') return  1;
      if (b == 'NoRegion') return -1;
      return a.localeCompare(b);
    }).map((region) => {
      let regionTotal = new Decimal(0);
      return {
        fields: Object.keys(billings[region]).sort().map((service) => {
          let cost    = billings[region][service];
          regionTotal = regionTotal.plus(new Decimal(cost));
          return {
            title: service,
            value: `${cost} USD`,
            short: true
          };
        }),
        title: `${region} (${regionTotal} USD)`,
        color: regionTotal > 0.0 ? 'good' : ''
      }
    });

    attachments.push({
      title: 'Total',
      text: `${total} USD`,
      color: 'danger'
    });

    let payload = {
      text: text,
      attachments: attachments
    };

    request(slack_req_opts, payload).then((res) => {
      console.log(res);
      callback(null, 'Success');
    }).catch((err) => {
      console.log(err, err.stack);
    });
  }).catch((err) => {
    console.log(err);
  });
};

function query(params) {
  return new Promise((resolve, reject) => {
    documentClient.query(params, function(err, data) {
      if (err) {
        reject(err);
      } else {
        resolve(data);
      }
    });
  });
}

function request(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (response) => {
      resolve(response);
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.write(JSON.stringify(body));
        
    req.end();
  });
}
