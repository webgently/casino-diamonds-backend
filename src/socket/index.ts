import { Server, Socket } from 'socket.io';
import uniqid from 'uniqid';
import axios from 'axios';
import { DUsers } from '../model';
import { currentTime, setlog } from '../helper';

const random = require('random-seed').create();

interface UserType {
  socketId: string;
  userid: string;
  username: string;
  avatar: string;
  balance: number;
  betAmount: number;
  apiToken: string;
  loading: boolean;
}

const scores = [
	{
		counts: [1, 1, 1, 1, 1],
		rate: 0
	},
	{
		counts: [1, 1, 1, 2],
		rate: 0.1
	},
	{
		counts: [1, 2, 2],
		rate: 2
	},
	{
		counts: [1, 1, 3],
		rate: 3
	},
	{
		counts: [2, 3],
		rate: 4
	},
	{
		counts: [1, 4],
		rate: 5
	},
	{
		counts: [5],
		rate: 50
	},
]

const findSameIndexs = (arr: number[]): number[][] | string => {
  const hash: Record<number, number[]> = {};
  for (let i = 0; i < arr.length; i++) {
    if (hash[arr[i]]) {
      hash[arr[i]].push(i);
    } else {
      hash[arr[i]] = [i];
    }
  }
  const indexes = Object.values(hash).filter((arr) => arr.length > 1);
  return indexes.length > 0 ? indexes : [];
}

const createRandomArray = (count:number, max:number) => { 
  let array = [];
  while (array.length < count) {
    array.push(random.intBetween(0, max))
  }
  return array;
}

const countDuplicate = (randomArray: number[])=> {
  let counts: any = [];
  randomArray.forEach((i) => {
    counts[i] = (counts[i] || 0) + 1;
  });
  
	counts = counts.filter((c:any) => { if (c) return c });
	counts = counts.sort();
	return counts;
}

const getScore = (counts: number[]) => {
	for (var score of scores) {
		if (arrayEquals(counts, score.counts)) {
			return score.rate;
		}
	}
	return 0;
}

const arrayEquals = (a:number[], b:number[])=> {
	return Array.isArray(a) &&
		Array.isArray(b) &&
		a.length === b.length &&
		a.every((val, index) => val === b[index]);
}

const gameResult = async () => { 
  const getArray = await createRandomArray(5, 6);
  const duplicate = await countDuplicate(getArray);
  const sameInds = findSameIndexs(getArray);
  const score = await getScore(duplicate);
  return { diamonds: getArray, sameInds:sameInds, score: score }
}

const register = async (user: any) => { 
  try { 
    const oldUser = await DUsers.findOne({ _id: user.userid });
    const now = currentTime();
    if (oldUser) {
      const update = await DUsers.updateOne({ _id: user.userid }, {
        $set: {
          balance: user.balance,
        }
      });
      return update ? true : false;
    } else { 
      const insert = await DUsers.insertOne({
        _id: user.userid,
        name: user.username,
        avatar: user.avatar,
        balance: user.balance,
        updated: now,
        created: now,
      });
      return insert ? true : false;
    }
  } catch (error) { 
    console.log('register error : ', error.message);
    setlog('register error', error.message);
  }
}

const updateBalance = async (userid: string, score: number, amount: number) => {
  if (!users[userid]) {
    return {
      status: false,
      message: 'Undefined user',
      amount: null
    };
  }
  const user = users[userid].apiToken ? await DUsers.findOne({ _id: userid }) : users[userid];

  if (!user) {
    return { status: false, message: 'Undefined user', amount: null };
  }

  let calc: number = user.balance;

  if (user.balance - amount < 0) { 
    return {
      status: false,
      message: 'Insufficient your balance',
      amount: null
    };
  }
  
  if (score > 0) {
    calc = calc - amount + amount * score;
  } else { 
    calc = calc - amount;
  }

  if (users[userid].apiToken) {
    const update = await DUsers.updateOne(
      { _id: userid },
      { $set: { balance: calc, updated: currentTime() } }
    );
  
    if (!update) {
      return { status: false, message: 'User balance updating is failed', amount: null };
    }
  } 

  return { status: true, message: 'Successfully', amount: calc };
};

const refundBalance = async (userid: string) => { 
  const update = await DUsers.updateOne(
    { _id: userid },
    { $set: { balance: 0, updated: currentTime() } }
  );
  return update ? true : false;
}

const getBalance = async (userid: string) => { 
  if (!userid) {
    return {
      status: false,
      message: 'Undefined user',
      amount: 0
    };
  }
  const getBalance = await DUsers.findOne({ _id: userid });
  if (getBalance) {
    return {
      status: true,
      message: 'Successfully',
      amount: getBalance.balance
    };
  } else { 
    return {
      status: false,
      message: 'Failed get user balance',
      amount: 0
    };
  }
}

let users = {} as { [key: string]: UserType };

export const initSocket = (io: Server) => {
  io.on('connection', async (socket: Socket) => {
    console.log('new User connected:' + socket.id);

    socket.on('disconnect', async () => {
      console.log('socket disconnected ' + socket.id);
      const userid = Object.keys(users).filter((key: string) => users[key].socketId === socket.id)[0];
      if (userid && users[userid].apiToken) {
        const balance = await getBalance(userid);
        if (balance.status) {
          const getUserInfo = await axios.post(`http://annie.ihk.vipnps.vip/iGaming/igaming/credit`,
            { userId: userid, balance: balance.amount, ptxid: uniqid() },
            { headers: { 'Content-Type': 'application/json', gamecode: 'Diamond', packageId: '4' } });
          console.log(getUserInfo.data);
          if (getUserInfo.data.success) {
            const result = await refundBalance(userid);
            if (!result) {
              setlog('refund update balance', `${userid}=> database error`);
            }
          } else {
            setlog('refund error', `${userid}=> platform error`);
          }
        } else {
          setlog('refund error', `${userid}=> ${balance.message}`);
        }
      }
      delete users[userid];
    });

    socket.on('join', async (req: any) => {
      try {
        if (req.token) {
          const getUserInfo = await axios.post(`http://annie.ihk.vipnps.vip/iGaming/igaming/getUserToken`, { token: req.token, ptxid: uniqid() });
          if (getUserInfo.data.success) {
            let user: any = getUserInfo.data.data;
            if (!users[user.userId] || users[user.userId]?.balance < 0.1) {
              const getBalance = await axios.post(
                `http://annie.ihk.vipnps.vip/iGaming/igaming/debit`,
                { userId: user.userId, token: user.userToken, ptxid: uniqid() },
                { headers: { 'Content-Type': 'application/json', gamecode: 'Diamond', packageId: '4' } },
              )
              
              if (getBalance.data.success) {
                users[user.userId] = {
                  socketId: socket.id,
                  userid: user.userId,
                  username: user.userName,
                  avatar: user.avatar,
                  balance: users[user.userId] ? Number(users[user.userId].balance) + Number(getBalance.data.data.balance) : Number(getBalance.data.data.balance),
                  betAmount: 0,
                  apiToken: req.token,
                  loading: false
                }
              } else {
                setlog('not found user balance from platform');
                
              }
            }
  
            const result = await register(users[user.userId]);
            if (result) {
              socket.emit(`join-${req.token}`, users[user.userId]);
              if (users[user.userId].balance < 0.1) {
                socket.emit(`insufficient-${user.userId}`);
                return;
              }
            } else {
              delete users[user.userId];
              setlog('register error', `${user.userId}=> user register`);
            }
          } else {
            setlog('not found user from platform');
            socket.emit(`error-${req.userid}`, "Can't find the platform");
          }
        } else { 
          let user = uniqid();
          users[user] = {
            socketId: socket.id,
            userid: user,
            username: user,
            avatar: user,
            balance: 1000,
            betAmount: 0,
            apiToken: '',
            loading: false
          }
          socket.emit(`join-${req.token}`, users[user]);
        }
      } catch (err) { 
        setlog('user join error');
        socket.emit(`error-${req.userid}`, "Can't find the platform");
      }
    });

    socket.on('playBet', async (req: any) => {
      const result = await gameResult();
      const getBalance = await updateBalance(req.userid, result.score, req.betAmount);
      if (getBalance.status) {
        users[req.userid] = {
          ...users[req.userid],
          balance: getBalance.amount
        };
        socket.emit(`playBet-${req.userid}`, { ...result, balance: getBalance.amount, socore: result.score });
        
        if (users[req.userid].apiToken) { 
          const options = {
            method: 'POST',
            url: 'http://annie.ihk.vipnps.vip/iGaming/igaming/orders',
            headers: {'Content-Type': 'application/json', gamecode: 'Diamond' },
            data: {
              ptxid: uniqid(),
              iGamingOrders: [
                {
                  packageId: 4,
                  userId: req.userid,
                  wonAmount: result.score > 0 ? String(result.score * req.betAmount - req.betAmount) : "0",
                  betAmount: String(req.betAmount),
                  odds: result.score > 0 ? String(result.score) : "0",
                  status: result.score > 0 ? 1 : 0,
                  timestamp: currentTime()
                }
              ]
            }
          };
          axios.request(options).then(function (response) {
          }).catch(function (error) {
            console.error(error);
          });
        }
      } else {
        setlog('playBet error', `${req.userid}=>${getBalance.message}`);
        socket.emit(`error-${req.userid}`, getBalance.message);
      }
    });

    socket.on('refund', async (req: any) => { 
      if (users[req.userid]?.apiToken) {
        const balance = await getBalance(req.userid);
        
        if (!users[req.userid]?.loading) {
          users[req.userid].loading = true;
          if (balance.status) {
            const getUserInfo = await axios.post(`http://annie.ihk.vipnps.vip/iGaming/igaming/credit`,
              { userId: req.userid, balance: balance.amount, ptxid: uniqid() },
              { headers: { 'Content-Type': 'application/json', gamecode: 'Diamond', packageId: '4' } });
            if (getUserInfo.data.success) {
              const result = await refundBalance(req.userid);
              if (result) {
                delete users[req.userid];
                socket.emit(`refund-${req.userid}`)
              } else {
                setlog('refund update balance', `${req.userid}=> database error`);
              }
            } else {
              setlog('refund error', `${req.userid}=> platform error`);
            }
          } else {
            setlog('refund error', `${req.userid}=> ${balance.message}`);
            socket.emit(`error-${req.userid}`, "Can't find the platform");
          }
        }
      } else { 
        delete users[req.userid];
        socket.emit(`refund-${req.userid}`)
      }
    })
  });
};

