import { SerialNumberResponder } from './SerialNumberResponder';

import type * as express from 'express';
import type { ExpressWrapper } from '../ExpressWrapper';

const mockServices = () => {
    return {
        SerialNumber: {
            users: [
                {
                    serial: 809,
                    user: '芋虫'
                }
            ],
            getNewSerialNumber: () => 809
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
        const req = mockReq('芋虫');
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
            serial: 809,
            message: 'Hello, 芋虫!'
        });
    });
});
