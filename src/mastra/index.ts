import { Mastra, MastraStorageLibSql } from '@mastra/core';
import { LibSQLVector } from '@mastra/vector-libsql';
import { ycDirectoryAgent } from './agents/agent';
import { syncYcDirectoryWorkflow } from './workflow';

const storage = new MastraStorageLibSql({
  config: {
    url: 'file:storage.db'
  }
})

const vector = new LibSQLVector({
  connectionUrl: 'file:data.db',
})

export const mastra = new Mastra({
  agents: { ycDirectoryAgent },
  workflows: { syncYcDirectoryWorkflow },
  storage,
  vectors: {
    libsql: vector
  }
});