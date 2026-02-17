import { generateClient } from 'aws-amplify/api';

const client = generateClient();

export const execute = async (
  { statement, name }: { statement: string; name: string },
  variables: Record<string, any>
) => {
  const { data } = (await client.graphql({
    query: statement,
    variables,
    authMode: 'apiKey',
  })) as any;
  return data[name];
};

export const executeContinuously = async (
  { statement, name }: { statement: string; name: string },
  variables: Record<string, any>,
  token: string | null = null
): Promise<any[]> => {
  try {
    const limit = 200;
    const params = { ...variables, limit, nextToken: token };
    const { data } = (await client.graphql({
      query: statement,
      variables: params,
      authMode: 'apiKey',
    })) as any;
    const { items, nextToken } = data[name];
    if (nextToken) {
      const nextItems = await executeContinuously(
        { statement, name },
        variables,
        nextToken
      );
      return items.concat(nextItems);
    }
    return items;
  } catch (err) {
    console.log('error in continuous execution', JSON.stringify(err));
    throw err;
  }
};

export const executeByParts = async (
  query: { statement: string; name: string },
  objList: any[]
) => {
  try {
    const limit = 25;
    let cur = 0;
    let result: any[] = [];
    while (cur < objList.length) {
      const promises = objList
        .slice(cur, cur + limit)
        .map((input) => execute(query, { input }));
      const chunk = await Promise.all(promises);
      result = result.concat(chunk);
      cur += limit;
    }
    return result;
  } catch (err) {
    console.log('error in batch execution', JSON.stringify(err));
    throw err;
  }
};
