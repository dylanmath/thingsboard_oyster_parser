// Decode an uplink message from a buffer
// payload - array of bytes
// metadata - key/value object

/*
//sigfox callback has been set up according to:
// https://support.digitalmatter.com/support/solutions/articles/16000056470-oyster-sigfox-integration-complete-protocol-
// https://support.digitalmatter.com/support/solutions/articles/16000062989-decoding-the-oyster-sigfox-payload-javascript-example-code
// https://support.digitalmatter.com/support/solutions/articles/16000061215-decoding-the-oyster-sigfox-payload-examples
{
  "device" : "2C321C",
  "data" : "20945376e9713269569a16cd",
  "time" : "1500520476",
  "snr" : "68.22",
  "station" : "3A5F",
  "avgSnr" : "73.13",
  "lat" : "-38.0",
  "lng" : "145.0",
  "rssi" : "-75.00",
  "seqNumber" : "007c",
  "Type" : "{customData#Type}",
  "InTrip" : "{customData#InTrip}",
  "FixFailed" : "{customData#FixFailed}",
  "Lat" : "{customData#Lat}",
  "Long" : "{customData#Long}",
  "Heading" : "{customData#Heading}",
  "Speed" : "{customData#Speed}",
  "Vbat" : "{customData#Vbat}"
}
*/

/** Decoder **/

// decode payload to string
var payloadStr = decodeToString(payload);

// decode payload to JSON
var data = decodeToJson(payload);
var deviceType = 'Oyster GPS';

var oysterPayload = parseSigFox(data.data);

// Result object with device attributes/telemetry data
var result = {
   deviceName: data.device,
   deviceType: deviceType,
   attributes: {
       integrationName: metadata['integrationName']
   },
   telemetry: {
       deviceId: data.device,
       data: data.data.substring(0,24),
       time: data.time,
       snr: data.snr,
       station: data.station,
       avgSnr: data.avgSnr,
       lat: data.lat,
       lng: data.lng,
       rssi: data.rssi,
       seqNumber: data.seqNumber,
       Type : oysterPayload.MessageType,
       InTrip : oysterPayload.InTrip,
       FixFailed : oysterPayload.LastFixFailed,
       Lat : oysterPayload.Latitude,
       Long : oysterPayload.Longitude,
       Heading : oysterPayload.Heading,
       Speed : oysterPayload.SpeedKmH,
       Vbat : oysterPayload.BatteryVoltage
   }
};

/** Helper functions **/

function hexToBytes(hex) {
    for (var bytes = [], c = 0; c < hex.length; c += 2)
        bytes.push(parseInt(hex.substr(c,2), 16));
        
    return bytes;
}

function decodeToString(payload) {
   return String.fromCharCode.apply(String, payload);
}

function decodeToJson(payload) {
   // covert payload to string.
   var str = decodeToString(payload);

   // parse string to JSON
   var data = JSON.parse(str);
   return data;
}

function hex2Bytes(val) {

    if (!val) {
        return [];
    }
    
    val = val.trim();
    if (val.startsWith('0x')) { 
        val = val.substring(2); //get rid of starting '0x'
    }


    var numBytes = val.length / 2;
    var bytes = [];


    for (var i = 0; i < numBytes; i++) {
        bytes.push(parseInt(val.substring(i*2, (i*2) + 2), 16));
    }

    return bytes;
}

function parseLittleEndianInt32(buffer, offset) {
    return (buffer[offset + 3] << 24) +
        (buffer[offset + 2] << 16) +
        (buffer[offset + 1] << 8) +
        (buffer[offset]);
}

function parseLittleEndianInt16(buffer, offset) {
    return (buffer[offset + 1] << 8) +
        (buffer[offset]);
}

function parseLittleEndianInt16Bits(buffer, offset, bitOffset, bitLength) {
    var temp = parseLittleEndianInt16(buffer, offset);
    temp = temp >> bitOffset;
    var mask = 0xffff >> (16 - bitLength);
    return temp & mask;
}

function parsePositionalData(buffer) {
    var flags = buffer[0] & 0xF0;
    var inTrip = (flags & 0x10) > 0;
    var lastFixFailed = (flags & 0x20) > 0;

    var latitudeRaw = parseLittleEndianInt32(buffer, 1);
    var longitudeRaw = parseLittleEndianInt32(buffer, 5);
    var headingRaw = buffer[9];
    var speedRaw = buffer[10];
    var batteryRaw = buffer[11];

    return {
        MessageType: 0,
        InTrip: inTrip,
        LastFixFailed: lastFixFailed,
        Latitude: latitudeRaw * 1e-7,
        Longitude: longitudeRaw * 1e-7,
        Heading: headingRaw * 2,
        SpeedKmH: speedRaw,
        BatteryVoltage: (batteryRaw * 25) / 1000.0
    };
}

function parseDownlinkAck(buffer) {
    var flags = buffer[0] & 0xF0;
    var downlinkAccepted = (flags & 0x10) > 0;

    var firmwareMajor = buffer[2];
    var firmwareMinor = buffer[3];

    var data = [];
    for (var i = 0; i < 8; i++) {
        data.push(i + 4);
    }

    return {
        MessageType: 1,
        DownlinkAccepted: downlinkAccepted,
        FirmwareVersion: firmwareMajor + '.' + firmwareMinor,
        DownlinkData: data
    };
}

function parseDeviceStats(buffer) {
    var uptimeWeeks = parseLittleEndianInt16Bits(buffer, 0, 4, 9/*bits*/);
    var txCountRaw = parseLittleEndianInt16Bits(buffer, 1, 5, 11 /*bits*/);
    var rxCountRaw = buffer[3];
    var tripCountRaw = parseLittleEndianInt16Bits(buffer, 4, 0, 13 /*bits*/);
    var gpsSuccessRaw = parseLittleEndianInt16Bits(buffer, 5, 5, 10 /*bits*/);
    var gpsFailuresRaw = parseLittleEndianInt16Bits(buffer, 6, 7, 8 /*bits*/);
    var averageFixTime = parseLittleEndianInt16Bits(buffer, 7, 7, 9/*bits*/);
    var averageFailTime = parseLittleEndianInt16Bits(buffer, 9, 0, 9/*bits*/);
    var averageFreshenTime = parseLittleEndianInt16Bits(buffer, 10, 1, 8/*bits*/);
    var wakeupsPerTrip = buffer[11] >> 1;

    return {
        MessageType: 2,
        UptimeWeeks: uptimeWeeks,
        TxCount: txCountRaw * 32,
        RxCount: rxCountRaw * 32,
        TripCount: tripCountRaw,
        GpsSuccessCount: gpsSuccessRaw * 32,
        GpsFailureCount: gpsFailuresRaw * 32,
        AverageFixTimeSeconds: averageFixTime,
        AverageFailTimeSeconds: averageFailTime,
        AverageFreshenTimeSeconds: averageFreshenTime,
        WakeUpsPerTrip: wakeupsPerTrip
    };
}

//e.g. 10b67dcc0006efda3d9816c2
function parseSigFox(data) {
    var buffer = hex2Bytes(data);

    if (!buffer) {
        return null;
    }

    var recordType = buffer[0] & 0x0f;

    switch (recordType) {
        case 0: //positional data
            return parsePositionalData(buffer);

        case 1: //downlink ACK
            return parseDownlinkAck(buffer);

        case 2: //device data
            return parseDeviceStats(buffer);

        default:
            return null;
    }
}

/**********************************************************************/

return result;
