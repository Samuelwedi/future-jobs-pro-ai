const test = require('node:test');
const assert = require('node:assert/strict');
const forge = require('node-forge');

test('certificate RSA verification rejects extra nested DigestAlgorithm data', () => {
  const {privateKey, publicKey} = forge.pki.rsa.generateKeyPair({bits: 1024, e: 65537});
  const md = forge.md.sha256.create();
  md.update('nested DigestAlgorithm regression');
  const digest = md.digest().bytes();
  const asn1 = forge.asn1;
  const cls = asn1.Class.UNIVERSAL;
  const type = asn1.Type;
  const digestInfo = asn1.create(cls, type.SEQUENCE, true, [
    asn1.create(cls, type.SEQUENCE, true, [
      asn1.create(cls, type.OID, false, asn1.oidToDer(forge.oids.sha256).getBytes()),
      asn1.create(cls, type.NULL, false, ''),
      asn1.create(cls, type.OCTETSTRING, false, 'unconsumed garbage'),
    ]),
    asn1.create(cls, type.OCTETSTRING, false, digest),
  ]);
  const malformedSignature = privateKey.sign(asn1.toDer(digestInfo).getBytes(), 'NONE');
  assert.throws(() => publicKey.verify(digest, malformedSignature), /valid RSASSA-PKCS1-v1_5 DigestInfo/);
  assert.equal(publicKey.verify(digest, privateKey.sign(md)), true);
});
