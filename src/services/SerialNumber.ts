class SerialNumber {
    public curSerial: number = 0;
    public users: { serial: number; user: string }[] = [];

    constructor(init: number = 0) {
        this.curSerial = init;
    }

    public getNewSerialNumber(user: string = ''): number {
        this.users.push({
            serial: this.curSerial,
            user
        });

        return this.curSerial += 1;
    }
}

export { SerialNumber };
