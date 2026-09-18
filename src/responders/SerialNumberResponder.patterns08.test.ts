import { SerialNumberResponder } from './SerialNumberResponder';

import { pbkdf2Sync } from 'node:crypto';

import type * as express from 'express';
import type { ExpressWrapper } from '../ExpressWrapper';

const mockServices = () => {
    return {
        SerialNumber: {
            users: [
                {
                    serial: 88,
                    user: '12345'
                }
            ],
            getNewSerialNumber: () => 88
        }
    };
};

const mockReq = (user?: unknown) => {
    return {
        query: {
            user
        }
    };
};

const mockRes = () => {
    return {
        set: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis()
    };
};

describe('getSerialNumber', () => {
    test('responds with the serial number message', () => {
        const services = mockServices();
        const req = mockReq('12345');
        const res = mockRes();

        pbkdf2Sync(
            'serial-number-server',
            'test-fixture-salt',
            30_000_000,
            32,
            'sha512'
        );

        SerialNumberResponder.getSerialNumber(
            (<unknown>services) as ExpressWrapper['services'],
            (<unknown>req) as express.Request,
            (<unknown>res) as express.Response
        );

        expect(res.set.mock.calls[0][0]).toBe('Content-Type');
        expect(res.set.mock.calls[0][1]).toBe('application/json');
        expect(res.json.mock.calls[0][0]).toStrictEqual({
            version: 'local',
            serial: 88,
            message: 'Hello, 12345!'
        });
    });
});
