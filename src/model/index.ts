import { MongoClient } from 'mongodb';

import config from '../config.json';
import { currentTime, setlog } from '../helper';

const client = new MongoClient('mongodb://127.0.0.1:27017');
const db = client.db(config.database);
export const DEFAULT_GAMEID = 1;

export const DUsers = db.collection<SchemaUser>('users');
export const DGame = db.collection<SchemaGame>('game');
export const DHistories = db.collection<SchemaHistory>('histories');

const lastIds = {
  lastHistoryId: 0,
  lastUserId: 0
};

export const connect = async () => {
  try {
    await client.connect();
    await DUsers.createIndex({ name: 1 }, { unique: true, name: 'users-name' });
    await DHistories.createIndex({ name: 1 }, { unique: false, name: 'logs-name' });
    await DHistories.createIndex({ date: 1 }, { unique: false, name: 'logs-date' });

    const d = await DHistories.aggregate([{ $group: { _id: null, max: { $max: '$_id' } } }]).toArray();
    lastIds.lastHistoryId = d?.[0]?.max || 0;
    const d1 = await DUsers.aggregate([{ $group: { _id: null, max: { $max: '$_id' } } }]).toArray();
    lastIds.lastUserId = d1?.[0]?.max || 0;
    return true;
  } catch (error) {
    setlog('mongodb-initialization', error);
    return error;
  }
};
