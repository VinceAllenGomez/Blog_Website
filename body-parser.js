const bodyParser = require('body-parser');

module.exports = {
  json: bodyParser.json({ limit: '5mb' }),
  urlencoded: bodyParser.urlencoded({ extended: true })
};
