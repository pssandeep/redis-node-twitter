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
const session = require('express-session');
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

  const saveSessionAndRenderDashboard = (userid) => {
    res.session.userid = userid;
    res.session.save();
    res.render("dashboard");
  };

//   if (!username || !password) {
//     res.render("error", {
//       message: "Please set both username and password",
//     });
//     return;
//   }

  console.log(req.body, username, password);

  client.hget("users", username, (err, userid) => {
    if (!userid) {
      //signup procedure
      console.log(1);
      client.incr("userid", async (err, userid) => {
        client.hset("users", username, userid);
        console.log(2);
        const saltRounds = 10;
        const hash = await bcrypt.hash(password, saltRounds);

        client.hset(`user:${userid}`, "hash", hash, "username", username);
        console.log(3);
        saveSessionAndRenderDashboard(userid);
      });
    } else {
      //login procedure
      console.log(4);
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
    }
  });

  res.end();
});

//SERVER
app.listen(3000, () =>
  console.log("server started and running at port 3000...")
);
