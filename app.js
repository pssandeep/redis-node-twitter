const express = require("express");
const app = express();
const path = require("path");

//Initialise databases
const redis = require("redis");
const client = redis.createClient();

//password hashing
const bcrypt = require("bcrypt");
const saltRounds = 10;

//set url encodeed to true
app.use(express.urlencoded({ extended: true }));

//Initialise connect-redis
const session = require("express-session");
const RedisStore = require("connect-redis")(session);

app.use(
  session({
    store: new RedisStore({ client: client }),
    resave: true,
    saveUninitialized: true,
    cookie: {
      maxAge: 36000000, //10 hours, in milliseconds
      httpOnly: false,
      secure: false,
    },
    secret: "bM80SARMxlq4fiWhulfNSeUFURWLTY8vyf",
  })
);

//set up view engine - PUG
app.set("view engine", "pug");
app.set("views", path.join(__dirname, "views"));

//GET
app.get("/", (req, res) => {
  if (req.session.userid) {
    res.render("dashboard");
  } else {
    res.render("login");
  }
});

//POST
app.post("/", (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    res.render("error", {
      message: "Please set both username and password",
    });
    return;
  }

  const saveSessionAndRenderDashboard = (userid) => {
    req.session.userid = userid;
    req.session.save();
    res.render("dashboard");
  };
  const handleSignup = (username, password) => {
    //signup procedure
    client.incr("userid", async (err, userid) => {
      client.hset("users", username, userid);
      const saltRounds = 10;
      const hash = await bcrypt.hash(password, saltRounds);

      client.hset(`user:${userid}`, "hash", hash, "username", username);
      saveSessionAndRenderDashboard(userid);
    });
  };
  const handleLogin = (userid, password) => {
    client.hget(`user:${userid}`, "hash", async (err, hash) => {
      const result = await bcrypt.compare(password, hash);
      if (result) {
        saveSessionAndRenderDashboard(userid);
      } else {
        res.render("error", {
          message: "Incorrect password",
        });
        return;
      }
    });
  };
  client.hget("users", username, (err, userid) => {
    if (!userid) {
      //signup procedure
      handleSignup(username, password);
    } else {
      //login procedure
      handleLogin(userid, password);
    }
  });
});

//DISPLAY FORM TO INPUT MESSAGE
app.get('/post', (req, res) => {
    if (req.session.userid) {
      res.render('post')
    } else {
      res.render('login')
    }
  });

//POST MESSAGE
app.post('/post', (req, res) => {
    if (!req.session.userid) {
      res.render('login')
      return
    }
    
    const { message } = req.body
    
    client.incr('postid', async (err, postid) => {
      client.hmset(`post:${postid}`, 'userid', req.session.userid, 'message', message, 'timestamp', Date.now())
      res.render('dashboard')
    })
  });

//SERVER
app.listen(3000, () =>
  console.log("server started and running at port 3000...")
);
