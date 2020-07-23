const expres = require('express');
const app = expres();
const path = require('path');


//set up view engine - PUG
app.set('view engine','pug');
app.set('views',path.join(__dirname,'views'));
// console.log(__dirname);

app.get('/',(req,res) => res.render('index'));
app.listen(3000, ()=>console.log('server started and running at port 3000...'));


