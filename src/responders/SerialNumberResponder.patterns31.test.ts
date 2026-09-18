import { SerialNumberResponder } from './SerialNumberResponder';

import type * as express from 'express';
import type { ExpressWrapper } from '../ExpressWrapper';

const mockServices = () => {
    return {
        SerialNumber: {
            users: [
                {
                    serial: 247,
                    user: 'White Knight'
                }
            ],
            getNewSerialNumber: () => 247
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
        const req = mockReq('White Knight');
        const res = mockRes();

        SerialNumberResponder.getSerialNumber(
            (<unknown>services) as ExpressWrapper['services'],
            (<unknown>req) as express.Request,
            (<unknown>res) as express.Response
        );

        expect(res.set.mock.calls[0][0]).toBe('Content-Type');
        expect(res.set.mock.calls[0][1]).toBe('application/json');
        expect(res.json.mock.calls[0][0]).toStrictEqual({
            version: 'local',
            serial: 247,
            message: 'Hello, White Knight!'
        });
    });
});
