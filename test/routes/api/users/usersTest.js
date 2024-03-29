// import dependencies
const chai = require('chai');
const expect = chai.expect;
const chaiHttp = require('chai-http');
const mysql = require('mysql');
const bcrypt = require('bcrypt');

// salt rounds for any bcrypt hashes
const saltRounds = 10;

// create db connection to test db, can't import this from server or it throws some handshake error
const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'headless_cms_test'
});

// import server
const server = require('../../../../server');

// use chai http
chai.use(chaiHttp);

describe('API/USERS', () => {
  const admin1 = {
    username: 'Bilbo',
    password: 'baggins',
    role: 'admin',
  };
  const adminPrivileges = {
    "create": true,
    "read own": true,
    "read any": true,
    "update own": true,
    "update any": true,
    "delete own": true,
    "delete any": true
  };
  const admin1Hash = bcrypt.hashSync(admin1.password, saltRounds);

  const user1 = {
    username: 'John',
    password: 'johndoe',
    role: 'user',
    privileges: {
      "create": true,
      "read own": true,
      "read any": true,
      "update own": true,
      "update any": false,
      "delete own": true,
      "delete any": false
    }
  };
  const user1Hash = bcrypt.hashSync(user1.password, saltRounds);

  let userOneId;

  before(done => {
    // insert the admin user before all tests
    db.connect(err => {
      if(err) {
        throw err;
      }
      db.query('INSERT INTO users (username, password, role, privileges) VALUES (?, ?, ?, ?)', [admin1.username, admin1Hash, admin1.role, JSON.stringify(adminPrivileges)], (err, results) => {
        if(err) {
          throw err;
        }
        done();
      });
    });
  });
  // clear all users after all tests
  after(done => {
    db.query('DELETE FROM users', (err, results) => {
      if(err) {
        throw err;
      }
      db.end(err => {
        if(err) {
          throw err;
        }
        done();
      });
    });
  });
  // add a non admin user to the db before each it block
  beforeEach(done => {
    db.query('INSERT INTO users (username, password, role, privileges) VALUES (?, ?, ?, ?)', [user1.username, user1Hash, user1.role, JSON.stringify(user1.privileges)], (err, results) => {
      if(err) {
        throw err;
      }
      db.query('SELECT id FROM users WHERE username = ?', [user1.username], (err, results) => {
        if(err) {
          throw err;
        }
        userOneId = results[0].id;
        done();
      });
    });
  });
  // remove all non admin users before the next it block in order to avoid unwanted side effects
  afterEach(done => {
    db.query('DELETE FROM users WHERE role != "admin"', (err, results) => {
      if(err) {
        throw err;
      }
      done();
    });
  });
  /*
    POST /api/user
    ACCESS: logged in ADMIN
  */
  describe('POST /api/user', () => {
    const newUser = {
      username: 'Fred',
      password: 'fredfred',
      role: 'user',
      privileges: {
        "create": true,
        "read own": true,
        "read any": true,
        "update own": true,
        "update any": false,
        "delete own": true,
        "delete any": false
      }
    };

    it('should return 403 and an error if not logged in as admin before trying to create new user', done => {
      chai.request(server)
        .post('/api/user')
        .send(newUser)
        .end((err, res) => {
          expect(res).to.have.status(403);
          expect(res.body.error).to.equal('Access denied');
          expect(res.body.success).to.be.false;
          done();
        })
    });
    it('should return a 400 error if the username is already in use', done => {
      const alreadyTakenUser = {
        username: user1.username,
        password: 'fredfred',
        role: 'user',
        privileges: {
          "create": true,
          "read own": true,
          "read any": true,
          "update own": true,
          "update any": false,
          "delete own": true,
          "delete any": false
        }
      };

      const agent = chai.request.agent(server)
      agent
        .post('/auth/login')
        .send(admin1)
        .end((err, res) => {
          expect(res).to.have.cookie('session_id');

          agent
            .post('/api/user')
            .send(alreadyTakenUser)
            .end((err, res) => {
              expect(res).to.have.status(400);
              expect(res.body.error).to.equal('Username already in use');
              expect(res.body.success).to.be.false;
              agent.close(err => {
                done();
              })
            })
        })
    });
    it('should return a 400 error if the new user object does not pass validation', done => {
      const invalidUser = {
        username: 'Fred',
        password: 'fre',
        role: 'user',
        privileges: {
          "create": true,
          "read own": true,
          "read any": true,
          "update own": true,
          "update any": false,
          "delete own": true,
          "delete any": false
        }
      };

      const agent = chai.request.agent(server)
      agent
        .post('/auth/login')
        .send(admin1)
        .end((err, res) => {
          expect(res).to.have.cookie('session_id');

          agent
            .post('/api/user')
            .send(invalidUser)
            .end((err, res) => {
              expect(res).to.have.status(400);
              expect(res.body.error).to.be.a('string');
              expect(res.body.success).to.be.false;
              agent.close(err => {
                done();
              })
            })
        })
    });
    it('should return success: true and message: User successfully created if successful', done => {
      const agent = chai.request.agent(server)
      agent
        .post('/auth/login')
        .send(admin1)
        .end((err, res) => {
          expect(res).to.have.cookie('session_id');

          agent
            .post('/api/user')
            .send(newUser)
            .end((err, res) => {
              expect(res.body.message).to.equal('User successfully created');
              expect(res.body.success).to.be.true;
              agent.close(err => {
                done();
              })
            })
        })
    });
    it('new user should be present in the DB if successful and properties should be correct', done => {
      const agent = chai.request.agent(server)
      agent
        .post('/auth/login')
        .send(admin1)
        .end((err, res) => {
          expect(res).to.have.cookie('session_id');

          agent
            .post('/api/user')
            .send(newUser)
            .end((err, res) => {
              db.query('SELECT * FROM users WHERE username = ? AND role = ?', [newUser.username, newUser.role], (err, results) => {
                if(err) {
                  throw err;
                }
                expect(results.length).to.equal(1);
                expect(results[0].username).to.equal(newUser.username);
                expect(results[0].role).to.equal(newUser.role);
                expect(results[0].privileges).to.equal(JSON.stringify(newUser.privileges));
                agent.close(err => {
                  done();
                })
              })
            })
        })
    });
  });
  
  /*
    GET /api/user/:id
    ACCESS: logged in ADMIN
  */
  describe('GET /api/user/:id', () => {
    it('should return 403 and an error if not logged in as admin before trying to get a user', done => {
      chai.request(server)
        .get(`/api/user/${userOneId}`)
        .end((err, res) => {
          expect(res).to.have.status(403);
          expect(res.body.error).to.equal('Access denied');
          expect(res.body.success).to.be.false;
          done();
        })
    });
    it('should return a 400 error if no user with the provided id exists', done => {
      const agent = chai.request.agent(server);
      agent
        .post('/auth/login')
        .send(admin1)
        .end((err, res) => {
          expect(res).to.have.cookie('session_id');

          agent
            .get(`/api/user/0`)
            .end((err, res) => {
              expect(res).to.have.status(400);
              expect(res.body.user).to.be.null;
              expect(res.body.success).to.be.false;
              expect(res.body.error).to.equal('No user exists with this id');
              agent.close(err => {
                done();
              })
            })
        })
    });
    it('should return the correct user object if a user exists with the id provided', done => {
      const agent = chai.request.agent(server);
      agent
        .post('/auth/login')
        .send(admin1)
        .end((err, res) => {
          expect(res).to.have.cookie('session_id');

          agent
            .get(`/api/user/${userOneId}`)
            .end((err, res) => {
              expect(res.body.user).to.be.an('object');
              expect(res.body.user.username).to.equal(user1.username);
              expect(res.body.user.role).to.equal(user1.role);
              expect(JSON.stringify(res.body.user.privileges)).to.equal(JSON.stringify(user1.privileges));
              expect(res.body.success).to.be.true;
              agent.close(err => {
                done();
              })
            })
        })
    });
  });

  /*
    PUT /api/user/:id
    ACCESS: logged in ADMIN
  */
  describe('PUT /api/user/:id', () => {
    const alteredUser = {
      username: 'Fred',
      password: 'fredfred',
      role: 'user',
      privileges: {
        "create": true,
        "read own": true,
        "read any": true,
        "update own": true,
        "update any": true,
        "delete own": true,
        "delete any": false
      }
    };

    it('should return 403 and an error if not logged in as admin before trying to alter a user', done => {
      chai.request(server)
        .put(`/api/user/${userOneId}`)
        .send(alteredUser)
        .end((err, res) => {
          expect(res).to.have.status(403);
          expect(res.body.error).to.equal('Access denied');
          expect(res.body.success).to.be.false;
          done();
        })
    });
    it('should return a 400 error if no user with the provided id exists', done => {
      const agent = chai.request.agent(server);
      agent
        .post('/auth/login')
        .send(admin1)
        .end((err, res) => {
          expect(res).to.have.cookie('session_id');

          agent
            .put(`/api/user/0`)
            .send(alteredUser)
            .end((err, res) => {
              expect(res).to.have.status(400);
              expect(res.body.success).to.be.false;
              expect(res.body.error).to.equal('No user exists with this id');
              agent.close(err => {
                done();
              })
            })
        })
    });
    it('should return a 400 error if the altered user object does not pass validation', done => {
      const invalidUser = {
        username: 'Fred',
        password: 'fre',
        role: 'martian',
        privileges: 'Very very privileged'
      };

      const agent = chai.request.agent(server)
      agent
        .post('/auth/login')
        .send(admin1)
        .end((err, res) => {
          expect(res).to.have.cookie('session_id');

          agent
            .put(`/api/user/${userOneId}`)
            .send(invalidUser)
            .end((err, res) => {
              expect(res).to.have.status(400);
              expect(res.body.error).to.be.a('string');
              expect(res.body.success).to.be.false;
              agent.close(err => {
                done();
              })
            })
        })
    });
    it('should return success: true and message: User successfully updated if successful', done => {
      const agent = chai.request.agent(server)
      agent
        .post('/auth/login')
        .send(admin1)
        .end((err, res) => {
          expect(res).to.have.cookie('session_id');

          agent
            .put(`/api/user/${userOneId}`)
            .send(alteredUser)
            .end((err, res) => {
              expect(res.body.message).to.equal('User successfully updated');
              expect(res.body.success).to.be.true;
              agent.close(err => {
                done();
              })
            })
        })
    });
    it('user with updated id in the DB should have fields matching the altered user if successful', done => {
      const agent = chai.request.agent(server)
      agent
        .post('/auth/login')
        .send(admin1)
        .end((err, res) => {
          expect(res).to.have.cookie('session_id');

          agent
            .put(`/api/user/${userOneId}`)
            .send(alteredUser)
            .end((err, res) => {
              db.query('SELECT * FROM users WHERE id = ?', [userOneId], (err, results) => {
                if(err) {
                  throw err;
                }
                expect(results[0].username).to.equal(alteredUser.username);
                expect(bcrypt.compareSync(alteredUser.password, results[0].password)).to.be.true;
                expect(results[0].role).to.equal(alteredUser.role);
                expect(results[0].privileges).to.equal(JSON.stringify(alteredUser.privileges));
                agent.close(err => {
                  done();
                })
              })
            })
        })
    });
  });

  /*
    DELETE /api/user/:id
    ACCESS: logged in ADMIN
  */
  describe('DELETE /api/user/:id', () => {
    it('should return 403 and an error if not logged in as admin before trying to delete a user', done => {
      chai.request(server)
        .delete(`/api/user/${userOneId}`)
        .end((err, res) => {
          expect(res).to.have.status(403);
          expect(res.body.error).to.equal('Access denied');
          expect(res.body.success).to.be.false;
          done();
        })
    });
    it('should return a 400 error if no user with the provided id exists', done => {
      const agent = chai.request.agent(server);
      agent
        .post('/auth/login')
        .send(admin1)
        .end((err, res) => {
          expect(res).to.have.cookie('session_id');

          agent
            .delete(`/api/user/0`)
            .end((err, res) => {
              expect(res).to.have.status(400);
              expect(res.body.success).to.be.false;
              expect(res.body.error).to.equal('No user exists with this id');
              agent.close(err => {
                done();
              })
            })
        })
    });
    it('should return success: true and message: User successfully deleted if successful', done => {
      const agent = chai.request.agent(server)
      agent
        .post('/auth/login')
        .send(admin1)
        .end((err, res) => {
          expect(res).to.have.cookie('session_id');

          agent
            .delete(`/api/user/${userOneId}`)
            .end((err, res) => {
              expect(res.body.message).to.equal('User successfully deleted');
              expect(res.body.success).to.be.true;
              agent.close(err => {
                done();
              })
            })
        })
    });
    it('user with deleted id should no longer be present in the DB if successful', done => {
      const agent = chai.request.agent(server)
      agent
        .post('/auth/login')
        .send(admin1)
        .end((err, res) => {
          expect(res).to.have.cookie('session_id');

          agent
            .delete(`/api/user/${userOneId}`)
            .end((err, res) => {
              db.query('SELECT * FROM users WHERE id = ?', [userOneId], (err, results) => {
                if(err) {
                  throw err;
                }
                expect(results.length).to.equal(0);
                agent.close(err => {
                  done();
                })
              })
            })
        })
    });
  });

  /*
    GET /api/users
    ACCESS: logged in ADMIN
  */
  describe('GET /api/users', () => {
    const user2 = {
      username: 'Jane',
      password: 'janedoe',
      role: 'user',
      privileges: {
        "create": true,
        "read own": true,
        "read any": true,
        "update own": true,
        "update any": false,
        "delete own": true,
        "delete any": false
      }
    };
    const user2Hash = bcrypt.hashSync(user1.password, saltRounds);

    // runs before all it blocks in this describe block
    beforeEach(done => {
      db.query('INSERT INTO users (username, password, role, privileges) VALUES (?, ?, ?, ?)', [user2.username, user2Hash, user2.role, JSON.stringify(user2.privileges)], (err, results) => {
        if(err) {
          throw err;
        }
        done();
      });
    });

    it('should return 403 and an error if not logged in as admin before trying to get all users', done => {
      chai.request(server)
        .get('/api/users')
        .end((err, res) => {
          expect(res).to.have.status(403);
          expect(res.body.error).to.equal('Access denied');
          expect(res.body.success).to.be.false;
          done();
        })
    });
    it('should return an array of all users (with the role "user") if successful', done => {
      const agent = chai.request.agent(server);
      agent
        .post('/auth/login')
        .send(admin1)
        .end((err, res) => {
          expect(res).to.have.cookie('session_id');

          agent
            .get('/api/users')
            .end((err, res) => {
              expect(res.body.success).to.be.true;
              expect(res.body.users).to.be.an('array');
              expect(res.body.users.length).to.equal(2);
              expect(res.body.users[0].username).to.equal(user1.username);
              expect(res.body.users[1].username).to.equal(user2.username);
              agent.close(err => {
                done();
              })
            })
        });
    });
    it('should NOT send back the password hash as part of the user object', done => {
      const agent = chai.request.agent(server);
      agent
        .post('/auth/login')
        .send(admin1)
        .end((err, res) => {
          expect(res).to.have.cookie('session_id');

          agent
            .get('/api/users')
            .end((err, res) => {
              expect(res.body.success).to.be.true;
              expect(res.body.users[0].password).to.be.undefined;
              expect(res.body.users[1].password).to.be.undefined;
              agent.close(err => {
                done();
              })
            })
        });
    });
  });

});