import test from 'node:test';
import assert from 'node:assert/strict';
import {createThrottledWriter} from '../src/writer.ts';

test('Agrupa muchos estados seguidos en una sola escritura', async t => {
  t.mock.timers.enable({apis: ['setTimeout']});
  const written: number[] = [];
  const writer = createThrottledWriter((value: number) => { written.push(value); }, 200);
  for (let value = 1; value <= 50; value++) writer.push(value);
  t.mock.timers.tick(200);
  await writer.flush();
  assert.deepEqual(written, [50]);
});

test('No pierde el último estado aunque no llegue otro cambio', async t => {
  t.mock.timers.enable({apis: ['setTimeout']});
  const written: number[] = [];
  const writer = createThrottledWriter((value: number) => { written.push(value); }, 200);
  writer.push(1);
  t.mock.timers.tick(200);
  await writer.flush();
  assert.deepEqual(written, [1]);
});

test('flush entrega el estado pendiente sin esperar al intervalo', async t => {
  t.mock.timers.enable({apis: ['setTimeout']});
  const written: number[] = [];
  const writer = createThrottledWriter((value: number) => { written.push(value); }, 200);
  writer.push(7);
  await writer.flush();
  assert.deepEqual(written, [7]);
});

test('Una escritura fallida no rompe las siguientes', async t => {
  t.mock.timers.enable({apis: ['setTimeout']});
  const written: number[] = [];
  const writer = createThrottledWriter(async (value: number) => {
    if (value === 1) throw new Error('Fallo de escritura');
    written.push(value);
  }, 200);
  writer.push(1);
  t.mock.timers.tick(200);
  await writer.flush();
  writer.push(2);
  t.mock.timers.tick(200);
  await writer.flush();
  assert.deepEqual(written, [2]);
});

test('Las escrituras conservan el orden de los cambios', async t => {
  t.mock.timers.enable({apis: ['setTimeout']});
  const written: number[] = [];
  const writer = createThrottledWriter(async (value: number) => {
    await Promise.resolve();
    written.push(value);
  }, 200);
  writer.push(1);
  t.mock.timers.tick(200);
  await writer.flush();
  writer.push(2);
  t.mock.timers.tick(200);
  await writer.flush();
  assert.deepEqual(written, [1, 2]);
});
