
/*
 * GET home page.
 */

exports.index = function(req, res){
  res.render('contacts.ejs', { title: 'gtacts' });
};