const express = require("express");
const app = express();
const path = require("path");
require("log-timestamp");
//Promisify
const { promisify } = require("util");
//Initialise databases
const redis = require("redis");
const client = redis.createClient();

//password hashing
const bcrypt = require("bcrypt");
const saltRounds = 10;

//date functions
const { formatDistance } = require("date-fns");

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

const ahget = promisify(client.hget).bind(client);
const asmembers = promisify(client.smembers).bind(client);
const ahkeys = promisify(client.hkeys).bind(client);
const aincr = promisify(client.incr).bind(client);
const alrange = promisify(client.lrange).bind(client);

//GET
app.get("/", async (req, res) => {
  if (req.session.userid) {
    const currentUserName = await ahget(
      `user:${req.session.userid}`,
      "username"
    );
    const following = await asmembers(`following:${currentUserName}`);
    const users = await ahkeys("users");

    const timeline = [];
    const posts = await alrange(`timeline:${currentUserName}`, 0, 100);

    for (post of posts) {
      const timestamp = await ahget(`post:${post}`, "timestamp");
      const timeString = formatDistance(
        new Date(),
        new Date(parseInt(timestamp))
      );

      timeline.push({
        message: await ahget(`post:${post}`, "message"),
        author: await ahget(`post:${post}`, "username"),
        timeString: timeString,
      });
    }

    res.render("dashboard", {
      users: users.filter(
        (user) => user !== currentUserName && following.indexOf(user) === -1
      ),
      currentUserName,
      timeline,
    });
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
    res.redirect("/");
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
app.get("/post", (req, res) => {
  if (req.session.userid) {
    res.render("post");
  } else {
    res.render("login");
  }
});

//POST MESSAGE
app.post("/post", async (req, res) => {
  if (!req.session.userid) {
    res.render("login");
    return;
  }

  const { message } = req.body;
  const currentUserName = await ahget(`user:${req.session.userid}`, "username");
  const postid = await aincr("postid");
  client.hmset(
    `post:${postid}`,
    "userid",
    req.session.userid,
    "username",
    currentUserName,
    "message",
    message,
    "timestamp",
    Date.now()
  );
  client.lpush(`timeline:${currentUserName}`, postid);

  const followers = await asmembers(`followers:${currentUserName}`);
  for (follower of followers) {
    client.lpush(`timeline:${follower}`, postid);
  }

  res.redirect("/");
});

//FOLLOW USER
app.post("/follow", (req, res) => {
  if (!req.session.userid) {
    res.render("login");
    return;
  }

  const { username } = req.body;

  client.hget(
    `user:${req.session.userid}`,
    "username",
    (err, currentUserName) => {
      client.sadd(`following:${currentUserName}`, username);
      client.sadd(`followers:${username}`, currentUserName);
    }
  );

  res.redirect("/");
});
//SERVER
app.listen(3000, () => {
  console.log("server started and running at port 3000...");
});
