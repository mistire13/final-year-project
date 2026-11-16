'use strict';
const { Joi } = require('../../middleware/validator');
// Optimized portraits from ImageDropzone, or a web image URL.
module.exports = Joi.string().max(2 * 1024 * 1024)
  .pattern(/^(?:https?:\/\/[^\s]+|data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+)$/)
  .allow('', null);
